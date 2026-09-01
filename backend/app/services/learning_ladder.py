"""Learning Ladder content generation — CLAUDE.md backlog #15.

Grows the `skill_questions` bank onto REAL taxonomy skills only (real Lightcast
skill_id, L3 practice_mode='levelled'), ranked by the post-scrape market-demand
snapshot instead of raw `job_skills` counts or users' existing CV skills.

Levelled-only by design: objectively teachable professional skills such as
Financial Accounting and Product Strategy are eligible even outside the old
five-domain allowlist. Behavioral/scenario skills remain demand evidence for
later case-study practice, never a numeric quiz ladder.

Two-pass quality gate, no cheap models (feedback_no_cheap_models_judgment):
generate on get_judgment_provider(), then an independent verify pass on the
same lane re-checks every correct_index. That verification IS the servable gate
(20260830170000) — `verified_at`, not a citation.

The source-grounded publisher this file once described was never built, and the
`source_url` / `source_allowlist_id` columns it would have bound were dropped on
2026-09-02: the allowlist held 0 rows for its whole life, and the 300 questions
carrying a URL cited 4 of them, two being homepages backing 200 questions. The
answer key is what a user is exposed to, so re-checking it is the gate that
matters — the 2026-08-30 sweep found 44 wrong keys, 7 live, none of which a
citation would have caught.

Prompt-building + parsing is pure and lives in learning_ladder_prompts.py
(unit tested without live calls); this module owns the DB reads/writes and
the two-call-per-level orchestration.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from app.database import get_supabase_admin
from app.repositories.job_skills_read_model import fetch_all_rows
from app.services.llm_provider import LLMProvider, get_judgment_provider
from app.services.learning_ladder_prompts import (
    GeneratedQuestion,
    TargetSkill,
    apply_verify_verdicts,
    build_generate_prompt,
    build_verify_prompt,
    dedupe_hash,
    parse_generated_questions,
)

logger = logging.getLogger(__name__)

LEVELLED_PRACTICE_MODE = "levelled"

LEVELS = (1, 2, 3, 4, 5)
QUESTIONS_PER_LEVEL = 10
# Asking for all 10 in one call truncates on some free-tier models (verified
# live: a 10-question ask cut off mid-JSON on nemotron-3-super-120b:free,
# 5-question ask completed cleanly on the same model). Two 5-question calls
# per level stays well under any free-tier output ceiling.
GEN_BATCH_SIZE = 5

__all__ = [
    "LEVELLED_PRACTICE_MODE",
    "TargetSkill",
    "GeneratedQuestion",
    "LadderResult",
    "pick_target_skills",
    "find_incomplete_skills",
    "generate_ladder_for_skill",
    "rows_for_insert",
    "insert_rows",
]


@dataclass
class LadderResult:
    skill: TargetSkill
    by_level: dict[int, list[GeneratedQuestion]] = field(default_factory=dict)


def pick_target_skills(limit: int = 10) -> list[TargetSkill]:
    """Top-N levelled skills by current live-market demand, not yet in the bank.

    Demand comes from `skill_demand_snapshot`, which is refreshed after
    scrape/verifier activity and already applies listing-liveness, employer
    spread, employer-dominance, and taxonomy guards. Restricted to real taxonomy
    rows (lightcast_id NOT NULL) so synthetic buckets cannot be selected.
    """
    admin = get_supabase_admin()

    covered_rows = fetch_all_rows(admin, table="skill_questions", columns="skill_id,status")
    covered_ids = {
        int(r["skill_id"])
        for r in covered_rows
        if r.get("status") in {"active", "review"}
    }

    skill_rows = fetch_all_rows(
        admin,
        table="skills",
        columns="id,display_name,l1_domain,l2_cluster,lightcast_id",
        query_builder=lambda q: q.eq("practice_mode", LEVELLED_PRACTICE_MODE).not_.is_(
            "lightcast_id", "null"
        ),
    )
    eligible: dict[int, TargetSkill] = {
        int(r["id"]): TargetSkill(
            id=int(r["id"]),
            display_name=r["display_name"],
            l1_domain=r["l1_domain"],
            l2_cluster=r.get("l2_cluster") or "",
        )
        for r in skill_rows
        if int(r["id"]) not in covered_ids
    }
    if not eligible:
        return []

    demand_rows = fetch_all_rows(
        admin,
        table="skill_demand_snapshot",
        columns="skill_id,window_key,roles,companies",
        query_builder=lambda q: q.eq("window_key", "30d"),
    )
    roles: dict[int, int] = {}
    companies: dict[int, int] = {}
    for r in demand_rows:
        sid = int(r["skill_id"])
        if sid not in eligible or r.get("window_key") != "30d":
            continue
        roles[sid] = roles.get(sid, 0) + int(r.get("roles") or 0)
        companies[sid] = companies.get(sid, 0) + int(r.get("companies") or 0)

    ranked = sorted(
        eligible.values(),
        key=lambda skill: (
            roles.get(skill.id, 0),
            companies.get(skill.id, 0),
            skill.display_name,
        ),
        reverse=True,
    )
    return [skill for skill in ranked if roles.get(skill.id, 0) > 0][:limit]


def find_incomplete_skills() -> list[tuple[TargetSkill, list[int]]]:
    """Levelled skills that already have SOME active content but not
    all 5 levels — a transient generation failure (truncation, dead provider)
    leaves a skill practiceable at only 1-4 of its 5 levels, which is worse
    than not started (a user hits a wall mid-ladder). Returns (skill, missing
    levels) so the caller can top these up before spending budget on new
    skills. Eligibility is the L3 practice contract, not a hard-coded domain
    list, so objectively assessable professional skills are included."""
    admin = get_supabase_admin()

    active_rows = fetch_all_rows(admin, table="skill_questions", columns="skill_id,level,status")
    levels_by_skill: dict[int, set[int]] = {}
    for r in active_rows:
        if r.get("status") not in {"active", "review"}:
            continue
        levels_by_skill.setdefault(int(r["skill_id"]), set()).add(int(r["level"]))
    partial_ids = {sid for sid, levels in levels_by_skill.items() if 0 < len(levels) < len(LEVELS)}
    if not partial_ids:
        return []

    skill_rows = fetch_all_rows(
        admin,
        table="skills",
        columns="id,display_name,l1_domain,l2_cluster",
        query_builder=lambda q: q.in_("id", list(partial_ids)).eq(
            "practice_mode", LEVELLED_PRACTICE_MODE
        ),
    )
    out: list[tuple[TargetSkill, list[int]]] = []
    for r in skill_rows:
        sid = int(r["id"])
        missing = sorted(set(LEVELS) - levels_by_skill[sid])
        skill = TargetSkill(
            id=sid,
            display_name=r["display_name"],
            l1_domain=r["l1_domain"],
            l2_cluster=r.get("l2_cluster") or "",
        )
        out.append((skill, missing))
    return out


async def generate_ladder_for_skill(
    skill: TargetSkill,
    provider: LLMProvider | None = None,
    levels: tuple[int, ...] | list[int] = LEVELS,
) -> LadderResult:
    provider = provider or get_judgment_provider()
    result = LadderResult(skill=skill)
    for level in levels:
        questions: list[GeneratedQuestion] = []
        seen_hashes: set[str] = set()
        remaining = QUESTIONS_PER_LEVEL
        attempts = 0
        max_attempts = 4  # generous headroom over the 2 clean batches this needs
        while remaining > 0 and attempts < max_attempts:
            attempts += 1
            batch_size = min(GEN_BATCH_SIZE, remaining)
            raw = await provider.complete(
                build_generate_prompt(skill, level, count=batch_size), max_tokens=3000
            )
            batch = parse_generated_questions(raw)
            for q in batch:
                h = dedupe_hash(q.question_text)
                if h not in seen_hashes:
                    seen_hashes.add(h)
                    questions.append(q)
            remaining = QUESTIONS_PER_LEVEL - len(questions)
            if not batch:
                break  # this batch call failed outright — don't loop forever
        if len(questions) < QUESTIONS_PER_LEVEL:
            logger.warning(
                "learning_ladder: %s level %d generated only %d/%d usable questions",
                skill.display_name, level, len(questions), QUESTIONS_PER_LEVEL,
            )
        if questions:
            verify_raw = await provider.complete(
                build_verify_prompt(skill, level, questions), max_tokens=2000
            )
            questions, verified = apply_verify_verdicts(questions, verify_raw)
            if not verified:
                logger.warning(
                    "learning_ladder: %s level %d verify pass unusable — shipping as review",
                    skill.display_name, level,
                )
        result.by_level[level] = questions
    return result


def rows_for_insert(result: LadderResult) -> list[dict]:
    """LadderResult -> unsourced draft rows, ready for admin insert."""
    rows: list[dict] = []
    for level, questions in result.by_level.items():
        for q in questions:
            rows.append({
                "skill_id": result.skill.id,
                "skill_key": result.skill.display_name,
                "level": level,
                "question_text": q.question_text,
                "options": q.options,
                "correct_index": q.correct_index,
                "explanation": q.explanation,
                "dedupe_hash": dedupe_hash(q.question_text),
                "status": "review",
                "review_status": "needs_review",
                "generation_provenance": (
                    "llm_generated_model_verified" if q.verified else "llm_generated_unverified"
                ),
            })
    return rows


def insert_rows(rows: list[dict]) -> int:
    """Upsert on the (skill_id, level, dedupe_hash) unique constraint — a
    re-run never double-inserts identical content. Returns rows written."""
    if not rows:
        return 0
    admin = get_supabase_admin()
    admin.table("skill_questions").upsert(
        rows, on_conflict="skill_id,level,dedupe_hash"
    ).execute()
    return len(rows)
