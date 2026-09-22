"""What production actually shows this person, measured against the yardstick.

Two numbers matter and they fail differently:

  `recall`     of the jobs a careful human would shortlist, how many can the
               person REACH in the product at all. Misses are invisible to the
               user — they never learn the job existed. This is the number that
               was 0.00 on 2026-09-19.
  `violations` of what production DOES show, how much fails the yardstick's own
               rules — wrong level, off direction, no skill in common. Visible
               to the user, and on a finite list of 35 each one costs trust.

A ratchet, not a fixed bar. `thresholds.json` records what we have already
earned, the gate fails when a change drops below it, and raising it is a
deliberate commit. A fixed bar set today would fail every build until the
retrieval rewrite lands; a ratchet fails only regressions.
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
    violations: list[str] = field(default_factory=list)
    missed_examples: list[str] = field(default_factory=list)

    @property
    def recall(self) -> float:
        return (self.reached / self.reference_size) if self.reference_size else 0.0

    @property
    def violation_rate(self) -> float:
        return (len(self.violations) / self.production_size) if self.production_size else 0.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "reference_size": self.reference_size,
            "production_size": self.production_size,
            "reached": self.reached,
            "recall": round(self.recall, 3),
            "violation_rate": round(self.violation_rate, 3),
            "violations": self.violations[:10],
            "missed_examples": self.missed_examples[:10],
        }


def production_visible(repo: Any, user_id: str, profile_row: dict[str, Any]) -> list[dict[str, Any]]:
    """Every listing this person can reach on /market, paged to the end.

    Calls the real repository the router calls, with the real account context —
    the point is to measure the product, not a reconstruction of it.
    """
    from app.services import test_accounts  # noqa: F401  (import proves the flag ships)

    seen: list[dict[str, Any]] = []
    page = 1
    while True:
        result = repo.feed_jobs(
            sort="fit",
            user_skill_keys=repo.user_skill_keys(user_id),
            user_target_roles=profile_row.get("target_role_titles") or [],
            primary_career_band=profile_row.get("target_career_band"),
            explored_career_bands=profile_row.get("explored_career_bands") or [],
            target_seniority=profile_row.get("target_seniority") or "any",
            page=page,
            page_size=50,
        )
        seen.extend(result.get("rows") or [])
        if not result.get("has_next_page"):
            return seen
        page += 1


def evaluate(
    profile: CandidateProfile,
    reference: list[ReferenceHit],
    production_rows: list[dict[str, Any]],
    corpus_by_id: dict[str, dict[str, Any]] | None = None,
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
    reference_ids = {hit.job_id for hit in reference}
    reached = reference_ids & reachable

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
    return GateResult(
        label=profile.label,
        reference_size=len(reference_ids),
        production_size=len(reachable),
        reached=len(reached),
        violations=violations,
        missed_examples=missed,
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
    ceiling = earned.get("max_violation_rate")
    if ceiling is not None and result.violation_rate > ceiling:
        failures.append(
            f"{result.label}: violations {result.violation_rate:.2f} above allowed {ceiling:.2f}"
        )
    return failures
