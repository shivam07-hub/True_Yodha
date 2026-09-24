"""What production actually shows this person, measured against the yardstick.

Three numbers matter and they fail differently:

  `admissible` of the jobs a careful human would shortlist, how many SURVIVE
               retrieval's filters at all. A miss here is unreachable at any
               depth: the person never learns the job exists. This is the number
               that was 0.00 on 2026-09-19.
  `recall`     of those, how many make the list actually shown. A miss here is a
               RANKING disagreement between two 40-item picks from the same
               admissible pool — a real cost, but a different fault with a
               different fix, and conflating the two is what nearly sent a
               ranking experiment out as a reachability win on 2026-09-24.
  `violations` of what production DOES show, how much fails the yardstick's own
               rules — wrong level, off direction, no skill in common. Visible
               to the user, and on a finite list of 35 each one costs trust.

A ratchet, not a fixed bar. `thresholds.json` records what we have already
earned, the gate fails when a change drops below it, and raising it is a
deliberate commit. A fixed bar set today would fail every build until the
retrieval rewrite lands; a ratchet fails only regressions.

One row per persona, because there is one retrieval. While the swap was in
flight the rows were keyed `<persona> · <retrieval>` so ratcheting the better
path could not fail the worse one; the 500-row sample is deleted, so that
suffix would now name a choice nobody has.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from quality.profile import CandidateProfile
from quality.reference_matcher import ReferenceHit, level_fits

THRESHOLDS = Path(__file__).with_name("thresholds.json")


@dataclass
class GateResult:
    label: str
    reference_size: int
    production_size: int
    reached: int
    admitted: int
    violations: list[str] = field(default_factory=list)
    missed_examples: list[str] = field(default_factory=list)
    unreachable_examples: list[str] = field(default_factory=list)

    @property
    def recall(self) -> float:
        return (self.reached / self.reference_size) if self.reference_size else 0.0

    @property
    def admissible_recall(self) -> float:
        return (self.admitted / self.reference_size) if self.reference_size else 0.0

    @property
    def violation_rate(self) -> float:
        return (len(self.violations) / self.production_size) if self.production_size else 0.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "reference_size": self.reference_size,
            "production_size": self.production_size,
            "reached": self.reached,
            "admitted": self.admitted,
            "recall": round(self.recall, 3),
            "admissible_recall": round(self.admissible_recall, 3),
            "violation_rate": round(self.violation_rate, 3),
            "violations": self.violations[:10],
            "missed_examples": self.missed_examples[:10],
            "unreachable_examples": self.unreachable_examples[:10],
        }


# Far past the 320 the densest profile measured, and the RPC's own filters are
# what bound the cost: asking for everything admissible is one pass either way.
_ADMISSIBLE_CEILING = 100_000


def retrieval_candidates(
    db: Any, user_id: str, limit: int
) -> tuple[list[dict[str, Any]], set[str]]:
    """What /market shows this person, and the wider set it could have shown.

    Two calls on purpose. The shown list is the product; the admissible set is
    everything that survived the filters, and the gap between them is ranking —
    the one distinction the single `recall` number could not make.

    It calls the RPC rather than `shortlist_jobs` because the second call asks for
    everything admissible, which no product surface wants: the repository method
    would fetch card columns for hundreds of rows to answer a question about ids.
    The shown half is the same rows the router serves, in the same order.
    """
    shown = (db.rpc("candidates_for_user",
                    {"p_user_id": user_id, "p_limit": limit}).execute()).data or []
    admissible = (db.rpc("candidates_for_user",
                         {"p_user_id": user_id,
                          "p_limit": _ADMISSIBLE_CEILING}).execute()).data or []
    return shown, {str(r["job_id"]) for r in admissible if r.get("job_id")}


def evaluate(
    profile: CandidateProfile,
    reference: list[ReferenceHit],
    production_rows: list[dict[str, Any]],
    corpus_by_id: dict[str, dict[str, Any]] | None = None,
    admissible_ids: set[str] | None = None,
) -> GateResult:
    """Judge both sides from the SAME raw listing.

    The feed returns a shaped CARD, not a row: `_feed_shape_row` never carries
    `role_family` or `main_skills` (it ships `skills`, already cut to five).
    Reading those absent keys off a card marked every job off-direction with
    nothing in common and reported 100% violations against a feed whose real
    fault is a different one. An absent field is not a verdict — so look each
    listing up in the corpus already in memory, and fall back to the card only
    when it genuinely is not there.
    """
    by_id = corpus_by_id or {}
    reachable = {str(row.get("job_id")) for row in production_rows if row.get("job_id")}
    # A path with no cut beyond paging admits exactly what it shows.
    admissible = reachable if admissible_ids is None else admissible_ids
    reference_ids = {hit.job_id for hit in reference}
    reached = reference_ids & reachable
    admitted = reference_ids & admissible

    violations: list[str] = []
    for row in production_rows:
        job = by_id.get(str(row.get("job_id"))) or row
        fits, _stated = level_fits(profile, job)
        label = f"{job.get('company_name')} — {job.get('job_title')}"
        if not fits:
            violations.append(f"level: {label}")
            continue
        family = (job.get("role_family") or "").strip()
        if profile.direction_families and family not in profile.direction_families:
            if profile.overlap(job.get("main_skills")) == 0:
                violations.append(f"off-direction, no shared skill: {label}")

    missed = [
        f"{hit.company} — {hit.title}"
        for hit in reference if hit.job_id not in reachable
    ]
    unreachable = [
        f"{hit.company} — {hit.title}"
        for hit in reference if hit.job_id not in admissible
    ]
    return GateResult(
        label=profile.label,
        reference_size=len(reference_ids),
        production_size=len(reachable),
        reached=len(reached),
        admitted=len(admitted),
        violations=violations,
        missed_examples=missed,
        unreachable_examples=unreachable,
    )


def load_thresholds() -> dict[str, dict[str, float]]:
    if not THRESHOLDS.exists():
        return {}
    return json.loads(THRESHOLDS.read_text(encoding="utf-8"))


def check(result: GateResult, thresholds: dict[str, dict[str, float]]) -> list[str]:
    """Regressions only — a ratchet never fails work for standing still."""
    earned = thresholds.get(result.label)
    if not earned:
        return []
    failures: list[str] = []
    floor = earned.get("min_recall")
    if floor is not None and result.recall < floor:
        failures.append(
            f"{result.label}: recall {result.recall:.2f} below earned {floor:.2f}"
        )
    admissible_floor = earned.get("min_admissible_recall")
    if admissible_floor is not None and result.admissible_recall < admissible_floor:
        failures.append(
            f"{result.label}: admissible recall {result.admissible_recall:.2f} "
            f"below earned {admissible_floor:.2f} — a job went unreachable"
        )
    ceiling = earned.get("max_violation_rate")
    if ceiling is not None and result.violation_rate > ceiling:
        failures.append(
            f"{result.label}: violations {result.violation_rate:.2f} above allowed {ceiling:.2f}"
        )
    return failures
