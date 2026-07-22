"""services/matching/agent_picks.py — auto-generate the editorial Agent Picks
band (Backlog #36 N5). Folds pick selection into the SAME brain pass.

The Career-Ops brain already ran during ``compute_job_matches`` — it wrote a
grade + Apply/Negotiate/Skip verdict + a grounded ``summary`` into
``user_job_matches`` for every rated job. Agent Picks are an editorial SELECT
over those cached evals: the genuinely-STRONG top-N the user is told to actually
apply to, ranked, tiered, with each pick's "why it fits YOU" taken VERBATIM from
the brain's own grounded summary.

No second LLM call (the brain's verdict is reused). No fabrication: a candidate
with no real summary is dropped, never given an invented comment — the picks
band would rather show fewer cards than a made-up reason (OQ4 / the "never
fabricated matches" DNA).

Writes ``user_agent_job_picks`` via ``JobsRepository.replace_agent_picks`` —
a fresh recommendation set each scrape, replacing the prior one. Human override
of the auto-set is a reserved power-user perk (later); today the brain owns it.
"""
from __future__ import annotations

import logging
from typing import Any

from app.services.job_intelligence_policy import is_recommendable_listing

logger = logging.getLogger(__name__)

# Editorial gate — only genuinely-strong evals become picks (never padded).
STRONG_SCORE = 3.5          # user_job_matches.overall_score is 0–5 (match_credibility floor)
BULLSEYE_SCORE = 4.3        # a pick this strong is a "bullseye", else "strong"
MAX_PICKS = 8               # the band is a shortlist, not a second feed
_APPLY_VERDICTS = {"Apply", "Negotiate"}
# Career-Ops' current blocked legitimacy verdict plus legacy persisted values.
# Keep the older vocabulary readable so historical match rows remain safe.
_BLOCKED_LEGITIMACY_TIERS = {"suspicious", "scam", "ghost", "spam"}


def _tier_for(score: float) -> str:
    return "bullseye" if score >= BULLSEYE_SCORE else "strong"


def select_agent_picks(
    stack: list[dict[str, Any]], *, scrape_batch: int | None = None
) -> list[dict[str, Any]]:
    """Pure selection: durable match rows → ranked pick dicts (no I/O).

    A row qualifies only if the brain rated it STRONG (score ≥ 3.5 + an
    Apply/Negotiate verdict), it isn't legitimacy-flagged junk, its job is still
    active, and it carries a real grounded summary to quote. Ranked by brain
    score (overlap as tie-break), capped at MAX_PICKS.
    """
    qualified: list[tuple[float, float, dict[str, Any]]] = []
    for row in stack:
        score = row.get("overall_score")
        if score is None or float(score) < STRONG_SCORE:
            continue
        if row.get("recommendation") not in _APPLY_VERDICTS:
            continue
        if (
            str(row.get("legitimacy_tier") or "").strip().lower()
            in _BLOCKED_LEGITIMACY_TIERS
        ):
            continue
        job = row.get("jobs") or {}
        if not is_recommendable_listing(job):
            continue
        comment = (row.get("summary") or "").strip()
        if not comment:  # no grounded "why" → never fabricate one; drop the pick
            continue
        job_id = str(row.get("job_id") or "")
        if not job_id:
            continue
        qualified.append((
            float(score),
            float(row.get("overlap_score") or 0),
            {"job_id": job_id, "comment": comment, "_score": float(score)},
        ))

    qualified.sort(key=lambda t: (t[0], t[1]), reverse=True)
    picks: list[dict[str, Any]] = []
    for rank, (_score, _overlap, pick) in enumerate(qualified[:MAX_PICKS], start=1):
        picks.append({
            "job_id": pick["job_id"],
            "agent_rank": rank,
            "tier": _tier_for(pick["_score"]),
            "comment": pick["comment"],
            "scrape_batch": scrape_batch,
        })
    return picks


def regenerate_for_user(
    repo: Any, user_id: str, *, scrape_batch: int | None = None
) -> int:
    """Read the user's fresh match stack, select the strong picks, and REPLACE
    their Agent Picks set. Returns rows written (0 clears the band).

    Called right after a sweep recompute so the editorial band always reflects
    the latest brain verdicts. Best-effort by contract — the caller swallows;
    a pick-gen failure must never break the recompute or the notification."""
    stack = repo.get_user_match_stack(user_id)
    picks = select_agent_picks(stack, scrape_batch=scrape_batch)
    written = repo.replace_agent_picks(user_id, picks, scrape_batch)
    logger.info(
        "metric agent_picks.regen user=%s candidates=%d picks=%d",
        user_id, len(stack), written,
    )
    return written
