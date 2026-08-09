"""Upskilling ladder service (PRD §4, §7) — Surface A.

The server holds the answer key. `start_set` serves questions WITHOUT
`correct_index`; grading happens only in `submit_set`. Tokens are awarded
strictly on a clear and only the first clear of each (skill, level), via the
existing idempotent `reward_xp` RPC (xp_service.reward) — no new ledger.

A clear writes only `skill_assessed_level`. Learning progress is deliberately
kept out of `user_skills`, because CV-derived skills feed scoring and matching.

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

# Surface B — gap calibration sizing (PRD §5). Diagnostic, never awards tokens.
GAP_MAX_SKILLS = 6
GAP_QUESTIONS_PER_SKILL = 3
COVERAGE_TARGET_SKILLS_MIN = 50
COVERAGE_TARGET_SKILLS_MAX = 60
COVERAGE_TARGET_QUESTIONS_PER_LEVEL_MIN = 10
COVERAGE_TARGET_QUESTIONS_PER_LEVEL_MAX = 12

CLEAR_ACTION = "upskilling_clear"
# Idempotency key for the first-clear reward. Keyed per user by (skill, level),
# not by attempt id, so re-clearing an already-cleared level pays 0 while a
# different user can earn their own first clear. The PRD's ref_id=attempt_id
# text predates this refinement; attempt ids only dedupe one attempt's retries.
CLEAR_REF_TABLE = "skill_level_clear"
SKILL_DISPLAY_COLUMNS = "id, taxonomy_key, display_name"
SNAPSHOT_TABLE = "quiz_attempt_question_snapshots"


def _has_text(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _question_structure_complete(row: dict) -> bool:
    options = row.get("options")
    if (
        not isinstance(options, list)
        or len(options) != 4
        or not all(_has_text(option) for option in options)
    ):
        return False
    try:
        correct_index = int(row.get("correct_index"))
    except (TypeError, ValueError):
        return False
    return 0 <= correct_index < len(options)


def _is_servable_question(row: dict) -> bool:
    """Source-grounded gate for anything served as Learning Ladder content.

    Human review metadata remains available for later quality operations, but
    it is not a pre-10k serving dependency. The runtime requires the objective
    content contract that can be checked without editorial staffing.
    """
    return (
        row.get("status") == "active"
        and row.get("retired_at") is None
        and _has_text(row.get("question_text"))
        and _has_text(row.get("source_url"))
        and _has_text(row.get("explanation"))
        and _question_structure_complete(row)
    )


def _servable_questions(rows: list[dict]) -> list[dict]:
    return [row for row in rows if _is_servable_question(row)]


def _clear_ref_id(skill_id: int, level: int) -> str:
    return f"{skill_id}:{level}"


# ── Ladder list ──────────────────────────────────────────────────────────────


def list_activity_dates(user_id: str, limit: int = 180) -> list[str]:
    """Recent practice-activity timestamps (ISO), newest-first — powers the home
    practice streak. Reads graded upskilling sets (quiz_attempts,
    mode='upskilling', submitted); gap calibrations are diagnostic and excluded.
    """
    admin = get_supabase_admin()
    result = (
        admin.table("quiz_attempts")
        .select("submitted_at")
        .eq("user_id", user_id)
        .eq("mode", "upskilling")
        .not_.is_("submitted_at", "null")
        .order("submitted_at", desc=True)
        .limit(limit)
        .execute()
    )
    return [str(row["submitted_at"]) for row in (result.data or []) if row.get("submitted_at")]


def coverage_summary() -> dict:
    """Learning Ladder coverage and market-catalog expansion target.

    A skill is comprehensive when every L1-L5 level has the minimum question
    count. The 50-skill target measures catalog breadth; it does not prevent
    complete ladders from being served or described as comprehensive.
    """
    admin = get_supabase_admin()
    rows = _servable_questions(
        (
            admin.table("skill_questions")
            .select("*")
            .eq("status", "active")
            .execute()
        ).data or []
    )
    by_skill: dict[int, dict[int, int]] = {}
    for row in rows:
        sid = int(row["skill_id"])
        level = int(row["level"])
        levels = by_skill.setdefault(sid, {})
        levels[level] = levels.get(level, 0) + 1

    complete_skill_ids = [
        sid
        for sid, levels in by_skill.items()
        if all(
            levels.get(level, 0) >= COVERAGE_TARGET_QUESTIONS_PER_LEVEL_MIN
            for level in range(1, 6)
        )
    ]
    complete_skill_count = len(complete_skill_ids)
    coverage_gate_met = complete_skill_count >= COVERAGE_TARGET_SKILLS_MIN
    all_servable_skills_complete = bool(by_skill) and complete_skill_count == len(by_skill)

    return {
        "coverage_gate_met": coverage_gate_met,
        "publication_scope": (
            "comprehensive" if all_servable_skills_complete else "partial"
        ),
        "complete_skill_count": complete_skill_count,
        "target_skill_min": COVERAGE_TARGET_SKILLS_MIN,
        "target_skill_max": COVERAGE_TARGET_SKILLS_MAX,
        "questions_per_level_min": COVERAGE_TARGET_QUESTIONS_PER_LEVEL_MIN,
        "questions_per_level_max": COVERAGE_TARGET_QUESTIONS_PER_LEVEL_MAX,
        "active_reviewed_question_count": len(rows),
        "active_reviewed_skill_count": len(by_skill),
    }


def list_skills(user_id: str) -> list[dict]:
    """Practiceable skills + per-level progress.

    cleared_level/assessed_level come from skill_assessed_level (the DEC-1a
    source of truth). user_skills only marks whether the skill was found on the
    CV; inferred CV levels do not count as cleared practice. demand/job_count are
    left at defaults here — the frontend merges its existing demand signal
    (buildPracticeSkills) over the top; this endpoint owns progress + bank
    readiness, not market demand.
    """
    admin = get_supabase_admin()

    # Skills with a servable bank: count active questions per (skill, level).
    bank_rows = _servable_questions(
        (
            admin.table("skill_questions")
            .select("*")
            .eq("status", "active")
            .execute()
        ).data or []
    )
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
        admin.table("skills").select(SKILL_DISPLAY_COLUMNS).in_("id", skill_ids).execute()
    ).data or []
    names = {
        int(r["id"]): (r.get("display_name") or r.get("taxonomy_key") or "")
        for r in name_rows
    }

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
    on_cv_ids = {int(r["skill_id"]) for r in legacy_rows}

    out: list[dict] = []
    for sid in skill_ids:
        levels_with_bank = [lvl for lvl, n in bank[sid].items() if n >= UPSKILLING_SET_SIZE]
        max_bank_level = max(levels_with_bank, default=0)
        a_lvl = assessed.get(sid, 0)
        cleared = min(a_lvl, 5)
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

    pool = _servable_questions(
        (
            admin.table("skill_questions")
            .select("*")
            .eq("skill_id", skill_id)
            .eq("level", level)
            .eq("status", "active")
            .execute()
        ).data or []
    )

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
    _snapshot_attempt_questions(admin, str(attempt["id"]), drawn)

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

    # Load the served questions WITH keys (server-side only). New attempts use
    # immutable snapshots; legacy attempts fall back to the original bank rows.
    q_rows = _answer_key_rows(admin, str(attempt["id"]), question_ids)
    keyed = {int(r.get("id") or r["question_id"]): r for r in q_rows}
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
                "rationales": kq.get("rationales") or {},
            }
        )

    max_score = len(question_ids)
    passed = score >= UPSKILLING_PASS_BAR

    # First-clear detection BEFORE awarding (the reward RPC is the safety net).
    earned_if_first = upskilling_award_for(score)
    first_clear = passed and not _level_already_paid(admin, user_id, skill_id, level)
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

    # On a pass: advance only the assessed learning level.
    if passed:
        _bump_assessed_level(admin, user_id, skill_id, level)

    # Award only the first clear of this (skill, level).
    if first_clear and tokens_awarded > 0:
        await xp_service.reward(
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
        "next_level_unlocked": next_level_unlocked,
        "results": results,
    }


# ── helpers ──────────────────────────────────────────────────────────────────


def _level_already_paid(admin, user_id: str, skill_id: int, level: int) -> bool:
    """True if this user already banked the first-clear reward for the level.

    Mirrors the reward_xp idempotency check, so we report tokens honestly even
    before the RPC short-circuits."""
    prior = (
        admin.table("coin_ledger")
        .select("id")
        .eq("user_id", user_id)
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


def _snapshot_attempt_questions(admin, attempt_id: str, questions: list[dict]) -> None:
    if not questions:
        return
    admin.table(SNAPSHOT_TABLE).insert(
        [
            {
                "attempt_id": attempt_id,
                "question_id": int(q["id"]),
                "position": idx,
                "skill_id": int(q["skill_id"]),
                "skill_key": q.get("skill_key") or "",
                "level": int(q.get("level") or 0),
                "question_text": q["question_text"],
                "options": list(q["options"]),
                "correct_index": int(q["correct_index"]),
                "explanation": q["explanation"],
                "rationales": q.get("rationales") or {},
                "source_url": q.get("source_url"),
                "source_provenance": q.get("source_provenance"),
                "license_posture": q.get("license_posture"),
                "reviewer": q.get("reviewer"),
                "verified_at": q.get("verified_at"),
                "content_edition_id": q.get("content_edition_id"),
            }
            for idx, q in enumerate(questions)
        ]
    ).execute()


def _answer_key_rows(admin, attempt_id: str, question_ids: list[int]) -> list[dict]:
    snapshots = (
        admin.table(SNAPSHOT_TABLE)
        .select("*")
        .eq("attempt_id", attempt_id)
        .execute()
    ).data or []
    if snapshots:
        order = {qid: idx for idx, qid in enumerate(question_ids)}
        return sorted(
            snapshots,
            key=lambda row: (
                int(row.get("position") or order.get(int(row["question_id"]), 0)),
                order.get(int(row["question_id"]), 0),
            ),
        )

    return (
        admin.table("skill_questions")
        .select("*")
        .in_("id", question_ids)
        .execute()
    ).data or []


# ── Surface B — job-anchored gap calibration (PRD §5) ────────────────────────


def start_gap(
    user_id: str,
    job_id: str,
    job_title: str,
    company: str | None,
    required: list[dict],
) -> dict:
    """Serve a short calibration across a job's gap skills.

    `required` = [{skill_key, target_level, user_level, is_primary}] built by the
    router from the existing skill-gap (reuses get_job_skills + user skill map).
    We pick the biggest gaps that also have a question bank, cap at
    GAP_MAX_SKILLS, draw GAP_QUESTIONS_PER_SKILL each. Served WITHOUT answer keys;
    grading + the assessed-level write happen in submit_gap. Diagnostic only — no
    tokens (Part A pays for *improvement*, not for taking a test).
    """
    admin = get_supabase_admin()

    def _empty(reason: str) -> dict:
        # A diagnostic surface with nothing to test is an EMPTY state, not a
        # client error — the panels render their own graceful copy per reason.
        # (The old 409 surfaced as "Couldn't load the drill" in the prep room.)
        return {
            "assessment_id": "",
            "job_id": job_id,
            "job_title": job_title or None,
            "company_name": company,
            "skills": [],
            "reason": reason,
        }

    gaps = [r for r in required if int(r["user_level"]) < int(r["target_level"])]
    # Biggest, most-required gaps first (primary, then level distance).
    gaps.sort(key=lambda r: (0 if r["is_primary"] else 1, -(int(r["target_level"]) - int(r["user_level"]))))
    gaps = gaps[:GAP_MAX_SKILLS]
    keys = [r["skill_key"] for r in gaps]
    if not keys:
        return _empty("no_gaps")

    bank_rows = _servable_questions(
        (
            admin.table("skill_questions")
            .select("*")
            .eq("status", "active")
            .in_("skill_key", keys)
            .execute()
        ).data or []
    )
    by_key: dict[str, list[dict]] = {}
    for q in bank_rows:
        by_key.setdefault(q["skill_key"], []).append(q)

    name_rows = (
        admin.table("skills")
        .select(SKILL_DISPLAY_COLUMNS)
        .in_("taxonomy_key", keys)
        .execute()
    ).data or []
    names = {
        r["taxonomy_key"]: (r.get("display_name") or r["taxonomy_key"])
        for r in name_rows
    }

    served: list[dict] = []
    all_qids: list[int] = []
    drawn_questions: list[dict] = []
    for r in gaps:
        pool = by_key.get(r["skill_key"], [])
        if not pool:
            continue
        n = min(GAP_QUESTIONS_PER_SKILL, len(pool))
        drawn = random.sample(pool, n)
        drawn_questions.extend(drawn)
        served.append(
            {
                "skill_id": int(drawn[0]["skill_id"]),
                "skill_key": r["skill_key"],
                "display_name": names.get(r["skill_key"], r["skill_key"]),
                "target_level": int(r["target_level"]),
                "calibration_set": [
                    {"id": int(q["id"]), "question_text": q["question_text"], "options": list(q["options"])}
                    for q in drawn
                ],
            }
        )
        all_qids.extend(int(q["id"]) for q in drawn)

    if not served:
        return _empty("no_bank")

    attempt = (
        admin.table("quiz_attempts")
        .insert(
            {
                "user_id": user_id,
                "mode": "gap_calibration",
                "job_id": job_id,
                "question_ids": all_qids,
                "max_score": len(all_qids),
            }
        )
        .execute()
    ).data[0]
    _snapshot_attempt_questions(admin, str(attempt["id"]), drawn_questions)

    return {
        "assessment_id": str(attempt["id"]),
        "job_id": job_id,
        "job_title": job_title or None,
        "company_name": company,
        "skills": served,
        "reason": None,
    }


def submit_gap(
    user_id: str,
    assessment_id: str,
    answers: list[dict],
    targets_by_key: dict[str, int],
) -> dict:
    """Grade a gap calibration → per-skill readiness map. Writes skill_assessed_level
    (max-semantics, never regresses, no tokens). JD-anchored: each missed
    calibration question drops the assessed level one below the job's target."""
    admin = get_supabase_admin()

    attempt_res = (
        admin.table("quiz_attempts").select("*").eq("id", assessment_id).maybe_single().execute()
    )
    attempt = attempt_res.data if attempt_res else None
    if not attempt or str(attempt["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")
    if attempt.get("mode") != "gap_calibration":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Not a gap calibration."
        )

    question_ids = [int(x) for x in (attempt.get("question_ids") or [])]
    q_rows = _answer_key_rows(admin, str(attempt["id"]), question_ids)
    selected = {int(a["question_id"]): int(a["selected_index"]) for a in answers}

    # Group correctness by skill.
    per_skill: dict[int, dict] = {}
    for q in q_rows:
        sid = int(q["skill_id"])
        rec = per_skill.setdefault(
            sid, {"skill_key": q["skill_key"], "correct": 0, "total": 0}
        )
        rec["total"] += 1
        if selected.get(int(q.get("id") or q["question_id"]), -1) == int(q["correct_index"]):
            rec["correct"] += 1

    names = {
        int(r["id"]): (r.get("display_name") or r.get("taxonomy_key") or "")
        for r in (
            admin.table("skills")
            .select(SKILL_DISPLAY_COLUMNS)
            .in_("id", list(per_skill.keys()))
            .execute()
        ).data or []
    }

    readiness: list[dict] = []
    ratios: list[float] = []
    for sid, rec in per_skill.items():
        key = rec["skill_key"]
        target = int(targets_by_key.get(key, 0)) or 1
        missed = rec["total"] - rec["correct"]
        assessed = max(0, min(5, target - missed))
        band = "ready" if assessed >= target else "close" if assessed >= target - 1 else "gap"
        # Diagnostic write — max-semantics, never regresses, no tokens.
        _bump_assessed_level(admin, user_id, sid, assessed)
        ratios.append(min(1.0, assessed / target) if target > 0 else 1.0)
        readiness.append(
            {
                "skill_id": sid,
                "skill_key": key,
                "skill": names.get(sid, key),
                "assessed_level": assessed,
                "target_level": target,
                "band": band,
                "why_it_matters": None,
                "practice_href": f"/forge?skill={key}",
            }
        )

    # Sort readiness worst-first (gaps the user should act on lead).
    band_rank = {"gap": 0, "close": 1, "ready": 2}
    readiness.sort(key=lambda r: (band_rank[r["band"]], r["assessed_level"] - r["target_level"]))

    if not attempt.get("submitted_at"):
        admin.table("quiz_attempts").update(
            {"score": None, "max_score": len(question_ids), "passed": None, "submitted_at": "now()"}
        ).eq("id", assessment_id).execute()

    overall = round(sum(ratios) / len(ratios) * 100) if ratios else 0
    return {"readiness": readiness, "overall_readiness_pct": overall}


async def _replay_result(admin, attempt: dict, question_ids: list[int]) -> dict:
    """Reconstruct a graded set's response without re-awarding (idempotent)."""
    q_rows = _answer_key_rows(admin, str(attempt["id"]), question_ids)
    keyed = {int(r.get("id") or r["question_id"]): r for r in q_rows}
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
            "rationales": keyed[qid].get("rationales") or {},
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
        "next_level_unlocked": level + 1 if passed and level < 5 else None,
        "results": results,
    }
