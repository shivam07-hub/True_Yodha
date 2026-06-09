"""Upskilling ladder service (PRD §4, §7) — Surface A.

The server holds the answer key. `start_set` serves questions WITHOUT
`correct_index`; grading happens only in `submit_set`. Tokens are awarded
strictly on a clear and only the first clear of each (skill, level), via the
existing idempotent `reward_xp` RPC (xp_service.reward) — no new ledger.

DEC-1a: a clear writes `skill_assessed_level` and bumps
`user_skills.matched_level = max(legacy, assessed)` so the demonstrated level
drives the headline number without ever regressing a user.

Surface B (gap calibration) lands in Slice 5 alongside its entry points.
"""

from __future__ import annotations

import random

from fastapi import HTTPException, status

from app.database import get_supabase_admin
from app.services import xp_service
from app.services.xp_policy import (
    UPSKILLING_PASS_BAR,
    UPSKILLING_SET_SIZE,
    upskilling_award_for,
)

CLEAR_ACTION = "upskilling_clear"
# Idempotency key for the first-clear reward. Keyed by (skill, level) — NOT the
# attempt id — so re-clearing an already-cleared level (a different attempt)
# finds the prior ledger row and pays 0, matching D5 "first clear of each
# (skill, level)". (The PRD's ref_id=attempt_id text predates this refinement;
# attempt_id would only dedupe retries of one attempt, not the level itself.)
CLEAR_REF_TABLE = "skill_level_clear"


def _clear_ref_id(skill_id: int, level: int) -> str:
    return f"{skill_id}:{level}"


# ── Ladder list ──────────────────────────────────────────────────────────────


def list_skills(user_id: str) -> list[dict]:
    """Practiceable skills + per-level progress.

    cleared_level/assessed_level come from skill_assessed_level (the DEC-1a
    source of truth), grandfathered against user_skills.matched_level so legacy
    forge levels never regress. demand/job_count are left at defaults here — the
    frontend merges its existing demand signal (buildPracticeSkills) over the
    top; this endpoint owns progress + bank readiness, not market demand.
    """
    admin = get_supabase_admin()

    # Skills with a servable bank: count active questions per (skill, level).
    bank_rows = (
        admin.table("skill_questions")
        .select("skill_id, skill_key, level")
        .eq("status", "active")
        .execute()
    ).data or []
    # skill_id -> { level -> count }, plus skill_key memo
    bank: dict[int, dict[int, int]] = {}
    keys: dict[int, str] = {}
    for r in bank_rows:
        sid = int(r["skill_id"])
        lvl = int(r["level"])
        bank.setdefault(sid, {})[lvl] = bank.get(sid, {}).get(lvl, 0) + 1
        keys.setdefault(sid, r.get("skill_key") or "")

    if not bank:
        return []

    skill_ids = list(bank.keys())

    # Display names from the taxonomy.
    name_rows = (
        admin.table("skills").select("id, taxonomy_key, name").in_("id", skill_ids).execute()
    ).data or []
    names = {int(r["id"]): (r.get("name") or r.get("taxonomy_key") or "") for r in name_rows}

    # Per-user assessed + legacy levels.
    assessed_rows = (
        admin.table("skill_assessed_level")
        .select("skill_id, assessed_level")
        .eq("user_id", user_id)
        .in_("skill_id", skill_ids)
        .execute()
    ).data or []
    assessed = {int(r["skill_id"]): int(r["assessed_level"] or 0) for r in assessed_rows}

    legacy_rows = (
        admin.table("user_skills")
        .select("skill_id, matched_level")
        .eq("user_id", user_id)
        .in_("skill_id", skill_ids)
        .execute()
    ).data or []
    legacy = {int(r["skill_id"]): int(r["matched_level"] or 0) for r in legacy_rows}
    on_cv_ids = {int(r["skill_id"]) for r in legacy_rows}

    out: list[dict] = []
    for sid in skill_ids:
        levels_with_bank = [lvl for lvl, n in bank[sid].items() if n >= UPSKILLING_SET_SIZE]
        max_bank_level = max(levels_with_bank, default=0)
        a_lvl = assessed.get(sid, 0)
        cleared = max(a_lvl, legacy.get(sid, 0))
        cleared = min(cleared, 5)
        out.append(
            {
                "skill_id": sid,
                "skill_key": keys.get(sid, ""),
                "display_name": names.get(sid, keys.get(sid, "")),
                "cleared_level": cleared,
                "next_level": min(cleared + 1, 5),
                "assessed_level": a_lvl,
                "on_cv": sid in on_cv_ids,
                "demand": "none",
                "job_count": 0,
                "max_bank_level": max_bank_level,
                "locked": max_bank_level == 0,
            }
        )
    out.sort(key=lambda s: (s["cleared_level"], -s["max_bank_level"]))
    return out


# ── Serve a set (no answer key) ──────────────────────────────────────────────


def start_set(user_id: str, skill_id: int, level: int) -> dict:
    admin = get_supabase_admin()

    pool = (
        admin.table("skill_questions")
        .select("id, skill_key, question_text, options")
        .eq("skill_id", skill_id)
        .eq("level", level)
        .eq("status", "active")
        .execute()
    ).data or []

    if len(pool) < UPSKILLING_SET_SIZE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Question bank for this skill at L{level} is still filling.",
        )

    drawn = random.sample(pool, UPSKILLING_SET_SIZE)
    question_ids = [int(q["id"]) for q in drawn]
    skill_key = drawn[0].get("skill_key") or ""

    attempt = (
        admin.table("quiz_attempts")
        .insert(
            {
                "user_id": user_id,
                "skill_id": skill_id,
                "level": level,
                "mode": "upskilling",
                "question_ids": question_ids,
                "max_score": UPSKILLING_SET_SIZE,
            }
        )
        .execute()
    ).data[0]

    return {
        "set_id": str(attempt["id"]),
        "skill_id": skill_id,
        "skill_key": skill_key,
        "level": level,
        "questions": [
            {
                "id": int(q["id"]),
                "question_text": q["question_text"],
                "options": list(q["options"]),
            }
            for q in drawn
        ],
    }


# ── Grade + award ────────────────────────────────────────────────────────────


async def submit_set(
    user_id: str,
    set_id: str,
    answers: list[dict],
    idempotency_key: str,
) -> dict:
    admin = get_supabase_admin()

    attempt_res = (
        admin.table("quiz_attempts").select("*").eq("id", set_id).maybe_single().execute()
    )
    attempt = attempt_res.data if attempt_res else None
    if not attempt or str(attempt["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set not found.")
    if attempt.get("mode") != "upskilling":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Not an upskilling set."
        )

    skill_id = int(attempt["skill_id"])
    level = int(attempt["level"])
    question_ids = [int(x) for x in (attempt.get("question_ids") or [])]

    # Idempotent replay: an already-graded attempt returns its prior verdict.
    if attempt.get("submitted_at"):
        return await _replay_result(admin, attempt, question_ids)

    # Load the served questions WITH keys (server-side only).
    q_rows = (
        admin.table("skill_questions")
        .select("id, correct_index, explanation")
        .in_("id", question_ids)
        .execute()
    ).data or []
    keyed = {int(r["id"]): r for r in q_rows}
    selected = {int(a["question_id"]): int(a["selected_index"]) for a in answers}

    results = []
    score = 0
    for qid in question_ids:
        kq = keyed.get(qid)
        if not kq:
            continue
        correct_index = int(kq["correct_index"])
        sel = selected.get(qid, -1)
        is_correct = sel == correct_index
        if is_correct:
            score += 1
        results.append(
            {
                "question_id": qid,
                "correct_index": correct_index,
                "is_correct": is_correct,
                "explanation": kq["explanation"],
            }
        )

    max_score = len(question_ids)
    passed = score >= UPSKILLING_PASS_BAR

    # First-clear detection BEFORE awarding (the reward RPC is the safety net).
    earned_if_first = upskilling_award_for(score)
    first_clear = passed and not _level_already_paid(admin, skill_id, level)
    tokens_awarded = earned_if_first if first_clear else 0

    # Persist the graded attempt + append answers.
    admin.table("quiz_attempts").update(
        {
            "score": score,
            "max_score": max_score,
            "passed": passed,
            "tokens_awarded": tokens_awarded,
            "idempotency_key": idempotency_key,
            "submitted_at": "now()",
        }
    ).eq("id", set_id).execute()

    admin.table("quiz_answers").upsert(
        [
            {
                "attempt_id": set_id,
                "question_id": r["question_id"],
                "selected_index": selected.get(r["question_id"], -1),
                "is_correct": r["is_correct"],
            }
            for r in results
        ],
        on_conflict="attempt_id,question_id",
    ).execute()

    # On a pass: advance the assessed level + grandfather the headline level.
    if passed:
        _bump_assessed_level(admin, user_id, skill_id, level)

    # Award only the first clear of this (skill, level).
    new_balance = await xp_service.get_xp_balance(user_id)
    if first_clear and tokens_awarded > 0:
        new_balance = await xp_service.reward(
            user_id=user_id,
            amount=tokens_awarded,
            action=CLEAR_ACTION,
            reason=f"Upskilling clear · skill {skill_id} · L{level} · {score}/{max_score}",
            ref_table=CLEAR_REF_TABLE,
            ref_id=_clear_ref_id(skill_id, level),
        )

    next_level_unlocked = level + 1 if passed and level < 5 else None
    return {
        "score": score,
        "max": max_score,
        "passed": passed,
        "first_clear": first_clear,
        "tokens_awarded": tokens_awarded,
        "new_xp_balance": new_balance,
        "next_level_unlocked": next_level_unlocked,
        "results": results,
    }


# ── helpers ──────────────────────────────────────────────────────────────────


def _level_already_paid(admin, skill_id: int, level: int) -> bool:
    """True if a first-clear reward for this (skill, level) was already banked.

    Mirrors the reward_xp idempotency check, so we report tokens honestly even
    before the RPC short-circuits."""
    prior = (
        admin.table("xp_ledger")
        .select("id")
        .eq("action", CLEAR_ACTION)
        .eq("ref_table", CLEAR_REF_TABLE)
        .eq("ref_id", _clear_ref_id(skill_id, level))
        .gt("delta", 0)
        .limit(1)
        .execute()
    ).data or []
    return len(prior) > 0


def _bump_assessed_level(admin, user_id: str, skill_id: int, level: int) -> None:
    existing = (
        admin.table("skill_assessed_level")
        .select("assessed_level")
        .eq("user_id", user_id)
        .eq("skill_id", skill_id)
        .maybe_single()
        .execute()
    )
    prev = int((existing.data or {}).get("assessed_level") or 0) if existing else 0
    new_level = max(prev, level)
    admin.table("skill_assessed_level").upsert(
        {
            "user_id": user_id,
            "skill_id": skill_id,
            "assessed_level": new_level,
            "last_assessed_at": "now()",
        },
        on_conflict="user_id,skill_id",
    ).execute()

    # DEC-1a: the headline level follows the assessed level, never regressing.
    us = (
        admin.table("user_skills")
        .select("matched_level")
        .eq("user_id", user_id)
        .eq("skill_id", skill_id)
        .maybe_single()
        .execute()
    )
    if us and us.data:
        legacy = int(us.data.get("matched_level") or 0)
        if new_level > legacy:
            admin.table("user_skills").update({"matched_level": new_level}).eq(
                "user_id", user_id
            ).eq("skill_id", skill_id).execute()
    else:
        admin.table("user_skills").insert(
            {
                "user_id": user_id,
                "skill_id": skill_id,
                "matched_level": new_level,
                "forge_sessions_count": 0,
                "total_forge_minutes": 0,
            }
        ).execute()


async def _replay_result(admin, attempt: dict, question_ids: list[int]) -> dict:
    """Reconstruct a graded set's response without re-awarding (idempotent)."""
    q_rows = (
        admin.table("skill_questions")
        .select("id, correct_index, explanation")
        .in_("id", question_ids)
        .execute()
    ).data or []
    keyed = {int(r["id"]): r for r in q_rows}
    ans_rows = (
        admin.table("quiz_answers")
        .select("question_id, is_correct")
        .eq("attempt_id", attempt["id"])
        .execute()
    ).data or []
    correctness = {int(r["question_id"]): bool(r["is_correct"]) for r in ans_rows}

    results = [
        {
            "question_id": qid,
            "correct_index": int(keyed[qid]["correct_index"]),
            "is_correct": correctness.get(qid, False),
            "explanation": keyed[qid]["explanation"],
        }
        for qid in question_ids
        if qid in keyed
    ]
    score = int(attempt.get("score") or 0)
    level = int(attempt["level"])
    passed = bool(attempt.get("passed"))
    tokens = int(attempt.get("tokens_awarded") or 0)
    return {
        "score": score,
        "max": int(attempt.get("max_score") or len(question_ids)),
        "passed": passed,
        "first_clear": tokens > 0,
        "tokens_awarded": tokens,
        "new_xp_balance": await xp_service.get_xp_balance(str(attempt["user_id"])),
        "next_level_unlocked": level + 1 if passed and level < 5 else None,
        "results": results,
    }
