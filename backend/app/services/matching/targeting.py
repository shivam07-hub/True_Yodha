"""Targeting Brief — the single read for "what Myro knows about what this user wants".

One module assembles the user's targeting from BOTH stores — the confirmed
`user_profiles` columns and the `user_memory` fact store (authored + distilled)
— so every consumer asks once instead of re-assembling its own subset:

- `for_ranking(jobs_repo, user_id)` → EVERY path that computes a brain verdict.
  `ranking_profile()` is the dict `llm_ranker.build_system_prompt` + `job_matcher`
  already read, plus `known_facts` (the same key intent-chat uses), so the Career
  Ops evaluator sees the full brief, not just the 5 stale columns. Three callers:
  `jobs_workflow.compute_job_matches` (the Search), `on_demand.ensure_job_eval`
  (brain-on-open, every surface), `feed_warm.warm_feed_shortlist` (the /market
  top-10). **`jobs_repo.get_user_profile_targeting` is this module's private
  input — a ranking path that calls it directly is memory-blind**, and because a
  verdict is cached permanently per (user, job) (migration 20260710) that blindness
  is permanent too. The two on-demand paths did exactly that until 2026-08-13:
  1,175 of the 1,686 brain verdicts in prod — 70% — were written without ever
  seeing a fact the user had told Myro. 308 of them (3 users, ~52 active notes
  each) were materially wrong; the rest belonged to users with no ranking-relevant
  facts, where blind and informed agree. Not backfilled, by decision: the guarantee
  is forward — the next Myro Ops Search returns a standardised verdict.
- `for_preflight(db, user_id)` → the "Refresh your matches" pre-flight modal.
  `preflight()` gap-fills empty fields from memory facts (silent prefill into the
  DRAFT — persistence still happens only on the user's Run/Save action, so the
  distiller's propose-only lock on profile columns holds).

Field ↔ fact-kind mapping (fill-empty-only; a user-entered column value is never
overwritten, even a junk one — the user edits it in the modal):

- deal_breakers  ← `constraint` / `work_mode` facts
- career_goal    ← `aspiration` facts
- superpower     ← no clean kind; column-only (stays manual)
- role titles    ← `target_role_titles` (source of record), falling back to the
  legacy single `target_role_title`, then to raw `target_roles` (pre-Phase-0
  rows where clusters were the only store)

Memory reads are fail-soft by construction: `UserMemoryRepository.list_active`
already degrades to `[]` via safe_read, and a repo without a real client (test
fakes) yields no facts — matching never breaks on the memory layer.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

_PROMPT_FACTS_CAP = 8
_PREFILL_DEAL_BREAKERS_CAP = 4
_DEAL_BREAKER_KINDS = ("constraint", "work_mode")
_GOAL_KINDS = ("aspiration",)


@dataclass(frozen=True)
class MemoryFact:
    kind: str
    text: str


@dataclass(frozen=True)
class TargetingBrief:
    profile: dict[str, Any]
    facts: list[MemoryFact]

    # ── ranking half ─────────────────────────────────────────────────────────

    def ranking_profile(self) -> dict[str, Any]:
        """The targeting dict the matcher + Career Ops prompt consume.

        Column shape is passed through untouched (deterministic role boost keeps
        reading `target_roles`); memory rides as `known_facts` — the key the
        intent-chat concierge already established for "what Myro remembers".
        """
        prof = dict(self.profile)
        if self.facts:
            prof["known_facts"] = [
                f"{fact.kind}: {fact.text}" for fact in self.facts[:_PROMPT_FACTS_CAP]
            ]
        return prof

    # ── pre-flight half ──────────────────────────────────────────────────────

    def preflight(self) -> dict[str, Any]:
        """Gap-filled manifest for the pre-flight modal + provenance map.

        `prefilled` names each field whose value came from memory (`"memory"`),
        so the surface can be honest about what Myro guessed vs what the user
        confirmed. Fill-empty-only: column values always win.
        """
        p = self.profile
        prefilled: dict[str, str] = {}

        role_titles = _clean_list(p.get("target_role_titles"))
        if not role_titles:
            single = (p.get("target_role_title") or "").strip()
            role_titles = [single] if single else _clean_list(p.get("target_roles"))

        deal_breakers = _clean_list(p.get("deal_breakers"))
        if not deal_breakers:
            derived = [f.text for f in self.facts if f.kind in _DEAL_BREAKER_KINDS]
            if derived:
                deal_breakers = derived[:_PREFILL_DEAL_BREAKERS_CAP]
                prefilled["deal_breakers"] = "memory"

        career_goal = (p.get("career_goal") or "").strip()
        if not career_goal:
            goal = next((f.text for f in self.facts if f.kind in _GOAL_KINDS), "")
            if goal:
                career_goal = goal
                prefilled["career_goal"] = "memory"

        location = (p.get("target_location") or "").strip()
        if not location:
            locations = _clean_list(p.get("target_locations"))
            location = locations[0] if locations else ""

        return {
            "role_titles": role_titles,
            "location": location or None,
            "deal_breakers": deal_breakers,
            "career_goal": career_goal or None,
            "superpower": (p.get("superpower") or "").strip() or None,
            "prefilled": prefilled,
            "memory_count": len(self.facts),
        }


# ── constructors ─────────────────────────────────────────────────────────────

def for_ranking(jobs_repo: Any, user_id: str) -> TargetingBrief:
    """Brief for the match pipeline. `jobs_repo` keeps owning the targeting
    SELECT + cv_markdown; memory joins from the same client when present
    (test fakes without one simply carry no facts)."""
    profile = jobs_repo.get_user_profile_targeting(user_id)
    return TargetingBrief(profile=profile or {}, facts=_facts(getattr(jobs_repo, "_db", None), user_id))


def for_preflight(db: Any, user_id: str) -> TargetingBrief:
    """Brief for the pre-flight modal (RLS-scoped client)."""
    from app.repositories.users import UsersRepository

    profile = UsersRepository(db).get_profile(user_id) or {}
    return TargetingBrief(profile=profile, facts=_facts(db, user_id))


def _facts(db: Any, user_id: str) -> list[MemoryFact]:
    if db is None:
        return []
    from app.repositories.user_memory import UserMemoryRepository

    rows = UserMemoryRepository(db).list_active(user_id)
    facts: list[MemoryFact] = []
    for row in rows:
        text = (row.get("text") or "").strip()
        if text:
            facts.append(MemoryFact(kind=(row.get("kind") or "note").strip(), text=text))
    return facts


def _clean_list(value: Any) -> list[str]:
    return [str(v).strip() for v in (value or []) if str(v).strip()]
