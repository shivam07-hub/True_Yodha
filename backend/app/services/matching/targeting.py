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
- `for_preflight(db, user_id)` → the Pre-flight Order. `preflight/memory_import`
  turns its profile and facts into lines, and a guess persists only on the user's
  answer, so the distiller's propose-only lock on profile columns holds.

Memory reads are fail-soft by construction: `UserMemoryRepository.list_active`
already degrades to `[]` via safe_read, and a repo without a real client (test
fakes) yields no facts — matching never breaks on the memory layer.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.services.direction import Direction

logger = logging.getLogger(__name__)

_PROMPT_FACTS_CAP = 8


@dataclass(frozen=True)
class MemoryFact:
    kind: str
    text: str


@dataclass(frozen=True)
class TargetingBrief:
    profile: dict[str, Any]
    facts: list[MemoryFact]

    def direction(self) -> "Direction":
        """What this person is aiming at — the SAME answer `/users/me` renders.

        One definition for the screen and for the run. The Career Ops run read
        the raw scoping key in seven places and derived the aspiration skills
        from it, so a blank scope meant a run with no idea what the person
        wanted — and it said nothing, because the fallback to skill overlap was
        silent. `scope_mode` is what ends that silence.
        """
        from app.services.direction import of

        return of(self.profile)

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
        # What this run can honestly promise. Carried on the same dict every
        # ranking path already reads, so a caller cannot scope on nothing
        # without the answer travelling beside it.
        prof["scope_mode"] = self.direction().scope_mode
        return prof


# ── constructors ─────────────────────────────────────────────────────────────

def direction_vocabulary(jobs_repo: Any, families: list[str] | None) -> frozenset[str]:
    """The skills a user's directions demand — the vocabulary `direction_fit`
    grades against.

    Lives here because it answers this module's question ("what does this user
    want") from the same families the Brief already carries, and because two
    callers needed it: the pick gate and the /market warm. A router cannot read
    it itself — the repository client seam is a service's to cross
    (`test_workflow_seams`).

    Fail-soft by contract: an unreadable vocabulary grades every job `unknown`,
    which degrades to the order each caller had before. Losing the direction is a
    worse answer; raising is a lost band or a feed with no verdicts.
    """
    from app.repositories.role_families import RoleFamiliesRepository
    from app.services.matching import direction_fit

    names = [str(f).strip() for f in (families or []) if str(f).strip()]
    if not names:
        return frozenset()
    try:
        return direction_fit.vocabulary(
            RoleFamiliesRepository(jobs_repo.client).core_skills(names), names
        )
    except Exception as exc:  # noqa: BLE001 — documented degradation, never a lost surface
        logger.warning("metric targeting.direction_vocabulary_failed error=%s", exc)
        return frozenset()


def for_ranking(jobs_repo: Any, user_id: str) -> TargetingBrief:
    """Brief for the match pipeline. `jobs_repo` keeps owning the targeting
    SELECT + cv_markdown; memory joins from the same client when present
    (test fakes without one simply carry no facts)."""
    profile = jobs_repo.get_user_profile_targeting(user_id)
    return TargetingBrief(profile=profile or {}, facts=_facts(getattr(jobs_repo, "_db", None), user_id))


def for_currency(jobs_repo: Any, user_id: str) -> TargetingBrief:
    """Brief for the list's questions on a read path — Verdict Currency (the
    columns its keys hash and the direction they name) and Admission (where they
    look, their years) — plus memory. `ranking_profile()` of this brief and of
    `for_ranking`'s give the same keys, direction and admission; what this one
    leaves out is the CV markdown."""
    profile = jobs_repo.get_list_columns(user_id)
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
