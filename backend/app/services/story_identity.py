"""story_identity — one achievement is one Career Story.

The Career Story Reservoir is becoming the user's Master CV: every dump, CV,
LinkedIn export, tailored rewrite and interview answer lands in it, and every
tailored CV is a projection of it. That only holds if each real achievement is
ONE story carrying every phrasing of it. This module is the one place that
invariant is enforced, for every inflow source.

  run      sweep a user's active stories. Called after every ingest (new stories
           meet the old) and lazily when the user opens Stories. Decided pairs
           never return, so a converged reservoir sweeps for free.
  decide   the user's ruling on a proposed pair: merged or keep_separate.
  undo     take a fold back exactly. Recorded as the user keeping both.

Rules (story_identity_rules, all pure):
  1 candidates   similarity only nominates; employer family, nearest neighbour,
                 no role, or a shared title decide which pairs are compared
  2 rule         near-verbatim pairs fold without a judge
  3 judge        same → fold · part_of / unsure → the user rules · different → kept.
                 A failed call records NOTHING: the pair is judged again next sweep.
  4 user         a ruling is law — enforced inside story_identity_fold (SQL)

A fold is archive-only and applied in one transaction by story_identity_fold.
"""
from __future__ import annotations

import logging
import time
from typing import Any

from postgrest.exceptions import APIError

from app.services import story_identity_rules as rules
from app.services.background import LANE_FAST, enqueue, handler
from app.services.llm_provider import LLMProvider, LLMProviderError, get_judgment_provider

logger = logging.getLogger("myro.story_identity")

JOB_TYPE = "story_identity"
PAIRS_PER_CALL = 24     # one batched judge call
MAX_CALLS_PER_RUN = 4   # a large reservoir converges across runs
_MAX_JUDGE_TOKENS = 1200
_DEBOUNCE_SECONDS = 15 * 60
_last_enqueue: dict[str, float] = {}  # per-process debounce, like role_dedup's


class StoryIdentityError(Exception):
    """A user action that cannot apply. The message is shown to the user."""


def _by_story(pointers: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for p in pointers:
        out.setdefault(str(p.get("story_id")), []).append(p)
    return out


def _canonical(pointers: list[dict[str, Any]]) -> str:
    chosen = next((p for p in pointers if p.get("is_canonical")), pointers[0] if pointers else None)
    return (chosen or {}).get("text") or ""


# ── the sweep ────────────────────────────────────────────────────────────────

async def run(repo: Any, user_id: str, *, provider: LLMProvider | None = None) -> dict[str, int]:
    counts = {"judged": 0, "folded": 0, "proposed": 0, "kept": 0}
    stories = {str(s["id"]): s for s in repo.active_stories(user_id)}
    if len(stories) < 2:
        return counts
    companies = repo.role_companies(user_id)
    pointers = _by_story(repo.all_story_pointers(user_id))
    pairs = rules.candidate_pairs(
        list(stories.values()), companies,
        repo.similar_pairs(user_id, rules.NOMINATE_FLOOR), repo.decided_pairs(user_id),
    )

    gone: set[str] = set()  # folded away during this run
    queue: list[rules.Pair] = []
    for a, b, similarity in pairs:
        if a in gone or b in gone:
            continue
        if rules.near_verbatim(similarity, _canonical(pointers.get(a, [])), _canonical(pointers.get(b, []))):
            if _fold(repo, user_id, stories, pointers, gone, a, b, verdict="auto_folded", decided_by="rule"):
                counts["folded"] += 1
        else:
            queue.append((a, b))

    judge_with = provider or (get_judgment_provider() if queue else None)
    limit = PAIRS_PER_CALL * MAX_CALLS_PER_RUN
    for start in range(0, min(len(queue), limit), PAIRS_PER_CALL):
        batch = [p for p in queue[start:start + PAIRS_PER_CALL] if p[0] not in gone and p[1] not in gone]
        if not batch:
            continue
        texts = [(_text(stories[a], companies, pointers), _text(stories[b], companies, pointers)) for a, b in batch]
        verdicts = await _judge(texts, judge_with)
        for (a, b), verdict in zip(batch, verdicts):
            outcome = rules.outcome(verdict)
            if outcome is None or a in gone or b in gone:
                continue
            counts["judged"] += 1
            if outcome == "fold":
                if _fold(repo, user_id, stories, pointers, gone, a, b, verdict="auto_folded", decided_by="judge"):
                    counts["folded"] += 1
            else:
                repo.record_verdict(user_id, a, b, outcome, "judge")
                counts["proposed" if outcome == "proposed" else "kept"] += 1

    logger.info(
        "metric story_identity.run user=%s candidates=%d judged=%d folded=%d proposed=%d kept=%d",
        user_id, len(pairs), counts["judged"], counts["folded"], counts["proposed"], counts["kept"],
    )
    return counts


def _text(story: dict[str, Any], companies: dict[str, str], pointers: dict[str, list[dict[str, Any]]]) -> str:
    role_id = story.get("role_id")
    company = companies.get(str(role_id), "") if role_id else ""
    return rules.story_text(story, company, _canonical(pointers.get(str(story["id"]), [])))


async def _judge(texts: list[tuple[str, str]], provider: Any) -> list[str | None]:
    try:
        raw = await provider.complete(rules.build_judge_messages(texts), max_tokens=_MAX_JUDGE_TOKENS)
    except LLMProviderError:
        logger.info("metric story_identity.judge_unavailable pairs=%d", len(texts))
        return [None] * len(texts)
    return rules.parse_judge(raw, len(texts))


def _fold(
    repo: Any, user_id: str, stories: dict[str, dict[str, Any]],
    pointers: dict[str, list[dict[str, Any]]], gone: set[str], a: str, b: str,
    *, verdict: str, decided_by: str,
) -> bool:
    counts = {sid: len(pointers.get(sid, [])) for sid in (a, b)}
    keep, dup = rules.pick_keep(stories[a], stories[b], counts)
    keep_id, dup_id = str(keep["id"]), str(dup["id"])
    plan = rules.fold_plan(keep, dup, pointers.get(keep_id, []), pointers.get(dup_id, []))
    try:
        repo.fold(user_id, plan, verdict=verdict, decided_by=decided_by)
    except APIError as exc:
        # A guard in story_identity_fold refused: the pair changed under this
        # sweep (a user ruling, a concurrent fold). The next sweep reads the
        # state as it is now.
        logger.info("metric story_identity.fold_refused user=%s reason=%s", user_id, exc.message)
        return False
    gone.add(dup_id)
    keep.update(metrics=plan.keep_metrics, skills=plan.keep_skills, inflow_ids=plan.keep_inflows)
    moving = set(plan.move_pointers)
    pointers[keep_id] = pointers.get(keep_id, []) + [
        {**p, "story_id": keep_id, "is_canonical": False}
        for p in pointers.get(dup_id, []) if str(p["id"]) in moving
    ]
    pointers.pop(dup_id, None)
    return True


# ── the user's rulings ───────────────────────────────────────────────────────

def decide(repo: Any, user_id: str, story_a: str, story_b: str, choice: str) -> None:
    existing = repo.verdict(user_id, story_a, story_b)
    if existing and existing.get("verdict") in ("auto_folded", "merged"):
        # Recording "kept apart" over a fold would leave them merged anyway.
        raise StoryIdentityError("These are already merged. Undo the merge to keep both.")
    if choice == "keep_separate":
        repo.record_verdict(user_id, story_a, story_b, "keep_separate", "user")
        return
    active = {str(s["id"]): s for s in repo.stories(user_id, [story_a, story_b]) if s.get("status") == "active"}
    if len(active) != 2:
        raise StoryIdentityError("One of these entries has changed since. Refresh to see it.")
    pointers = _by_story(repo.story_pointers(user_id, [story_a, story_b]))
    keep, dup = rules.pick_keep(
        active[story_a], active[story_b], {sid: len(pointers.get(sid, [])) for sid in active},
    )
    plan = rules.fold_plan(keep, dup, pointers.get(str(keep["id"]), []), pointers.get(str(dup["id"]), []))
    try:
        repo.fold(user_id, plan, verdict="merged", decided_by="user")
    except APIError as exc:
        raise StoryIdentityError("One of these entries has changed since. Refresh to see it.") from exc


def undo(repo: Any, user_id: str, story_a: str, story_b: str) -> None:
    row = repo.verdict(user_id, story_a, story_b)
    if not row or row.get("verdict") not in ("auto_folded", "merged"):
        raise StoryIdentityError("There's no merge to undo here.")
    keep = repo.story(user_id, str(row["keep_id"]))
    if not keep:
        raise StoryIdentityError("There's no merge to undo here.")
    try:
        repo.unfold(user_id, rules.unfold_plan(row, keep))
    except APIError as exc:
        raise StoryIdentityError("This entry was merged again since. Undo that merge first.") from exc


# ── triggers ─────────────────────────────────────────────────────────────────

def maybe_enqueue(user_id: str) -> bool:
    """Lazy sweep when Stories is about to be looked at — compute only where
    someone will see the result. Debounced per process."""
    now = time.time()
    if now - _last_enqueue.get(user_id, 0.0) < _DEBOUNCE_SECONDS:
        return False
    _last_enqueue[user_id] = now
    enqueue(LANE_FAST, JOB_TYPE, payload={"user_id": user_id}, correlation_id=f"{JOB_TYPE}:{user_id}")
    return True


@handler(JOB_TYPE)
async def _story_identity_job(payload: dict[str, Any], allow_retry: bool) -> None:  # noqa: ARG001
    user_id = str(payload.get("user_id") or "")
    if not user_id:
        return
    from app.database import get_supabase_admin
    from app.repositories.story_identity import StoryIdentityRepository

    await run(StoryIdentityRepository(get_supabase_admin()), user_id)
