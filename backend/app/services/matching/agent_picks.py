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
from app.services.matching import direction_fit, targeting

logger = logging.getLogger(__name__)

# Editorial gate — only genuinely-strong evals become picks (never padded).
# 4.0, not the 3.5 credibility floor (Shivam, 2026-09-16). Upstream career-ops
# applies at 4.0 and calls 3.5–3.9 "decent but not ideal, apply only if you have
# a specific reason"; a band that says "apply to these" cannot be built out of
# roles whose own verdict is a shrug. The feed keeps 3.5 for its verdict word —
# that answers "how good is this", a different question from "should you spend
# an application on it".
PICK_SCORE = 4.0            # user_job_matches.overall_score is 0–5
BULLSEYE_SCORE = 4.3        # a pick this strong is a "bullseye", else "strong"
MAX_PICKS = 8               # the band is a shortlist, not a second feed

# A thin band is filled with REACH, and reach is on-direction only.
#
# Measured 2026-09-16 over users who have a direction: the 3.5 floor gave 24 of
# them a band, the 4.0 bar gives 6. A bar that empties three bands in four is
# right about what a pick MEANS and wrong about what the surface should then do
# — Match Verdict already holds the rule that no strong match must not become an
# empty hand. So when fewer than MIN_PICKS clear 4.0, the band is topped up to
# MIN_PICKS from roles that are ON DIRECTION at 3.5-3.99, tiered `reach` (a word
# the card already renders).
#
# Off-direction and ungradable rows never fill. The fill's whole promise is "at
# least this is the work you asked for"; filling it with a role we cannot say
# that about would make the tier a lie and hand back the Data Engineer this gate
# exists to stop.
REACH_SCORE = 3.5           # the credibility floor — below it nothing is shown at all
MIN_PICKS = 3               # a band thinner than this is topped up, never padded past it

# Aspiration outranks the score, and the score orders within it (Shivam's call,
# 2026-09-16: "closest match to the user's CV and the aspiration he fed in").
# The brain score already carries CV fit; the direction carries what the user
# asked for, so a lexicographic sort says the aspiration decides and the CV
# breaks ties. No quota either way: when nothing on-direction clears the bar,
# off-direction picks fill the band and each says so on its face.
#
# `unknown` sits BETWEEN the two on purpose. It means we could not grade — the
# user named no direction, or the listing names no skills — and a job must be
# neither demoted nor promoted on missing data.
_DIRECTION_RANK = {"on_direction": 2, "unknown": 1, "off_direction": 0}
_APPLY_VERDICTS = {"Apply", "Negotiate"}
# Career-Ops' current blocked legitimacy verdict plus legacy persisted values.
# Keep the older vocabulary readable so historical match rows remain safe.
_BLOCKED_LEGITIMACY_TIERS = {"suspicious", "scam", "ghost", "spam"}


def _tier_for(score: float) -> str:
    return "bullseye" if score >= BULLSEYE_SCORE else "strong"


def select_agent_picks(
    stack: list[dict[str, Any]],
    *,
    scrape_batch: int | None = None,
    vocabulary: frozenset[str] = frozenset(),
) -> list[dict[str, Any]]:
    """Pure selection: durable match rows → ranked pick dicts (no I/O).

    A row qualifies only if the brain rated it a real apply (score ≥ PICK_SCORE
    + an Apply/Negotiate verdict), it isn't legitimacy-flagged junk, its job is
    still active, and it carries a real grounded summary to quote.

    When fewer than MIN_PICKS clear that bar, the band is topped up with
    on-direction roles at REACH_SCORE..PICK_SCORE, tiered `reach`. They always
    sit below every real pick, and a row that is off-direction or ungradable is
    never used to fill.

    `vocabulary` is the user's direction, as the skills it demands
    (`direction_fit.vocabulary`). Empty — no direction chosen, or a snapshot
    that cannot grade it — leaves every pick `unknown` and the order falls back
    to the brain score alone, which is exactly the old behaviour. Nothing can
    fill in that state, because nothing can be shown to be on direction.
    """
    qualified: list[tuple[int, float, float, dict[str, Any]]] = []
    reach: list[tuple[float, float, dict[str, Any]]] = []
    for row in stack:
        score = row.get("overall_score")
        if score is None or float(score) < REACH_SCORE:
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
        # The line the reader sees. `pick_reason` is written TO them and checked
        # by reader_voice; `summary` is the evaluator writing ABOUT them, which
        # is what 13 of the 30 live picks were quoting on 2026-09-11 ("the
        # candidate's technical skills"). Rows rated before the v2 prompt have no
        # pick_reason and keep the old line until they are re-rated.
        comment = (row.get("pick_reason") or "").strip() or (row.get("summary") or "").strip()
        if not comment:  # no grounded "why" → never fabricate one; drop the pick
            continue
        job_id = str(row.get("job_id") or "")
        if not job_id:
            continue
        skills = job.get("main_skills")
        fit = direction_fit.grade(skills if isinstance(skills, (list, tuple)) else None, vocabulary)
        candidate = {
            "job_id": job_id,
            "comment": comment,
            "_score": float(score),
            "direction": fit.verdict,
        }
        if float(score) >= PICK_SCORE:
            qualified.append((
                _DIRECTION_RANK.get(fit.verdict, 1),
                float(score),
                float(row.get("overlap_score") or 0),
                candidate,
            ))
        elif fit.is_on_direction:
            reach.append((float(score), float(row.get("overlap_score") or 0), candidate))

    qualified.sort(key=lambda t: (t[0], t[1], t[2]), reverse=True)
    chosen: list[tuple[dict[str, Any], str]] = [
        (pick, _tier_for(pick["_score"])) for *_rank, pick in qualified[:MAX_PICKS]
    ]
    if len(chosen) < MIN_PICKS:
        reach.sort(key=lambda t: (t[0], t[1]), reverse=True)
        for _score, _overlap, pick in reach[: MIN_PICKS - len(chosen)]:
            chosen.append((pick, "reach"))

    picks: list[dict[str, Any]] = []
    for rank, (pick, tier) in enumerate(chosen, start=1):
        picks.append({
            "job_id": pick["job_id"],
            "agent_rank": rank,
            "tier": tier,
            "comment": pick["comment"],
            "direction": pick["direction"],
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
    brief = targeting.for_ranking(repo, user_id)
    vocabulary = targeting.direction_vocabulary(
        repo, brief.ranking_profile().get("target_roles")
    )
    picks = select_agent_picks(stack, scrape_batch=scrape_batch, vocabulary=vocabulary)
    written = repo.replace_agent_picks(user_id, picks, scrape_batch)
    on_direction = sum(1 for p in picks if p.get("direction") == "on_direction")
    logger.info(
        "metric agent_picks.regen user=%s candidates=%d picks=%d on_direction=%d",
        user_id, len(stack), written, on_direction,
    )
    return written
