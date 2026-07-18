"""
percentile.py
Band-relative percentile math — pure, no I/O.

The Mirror Score is scored against the candidate's seniority band, so
"where do I stand" is only honest when compared to same-band peers. We store a
percentile RANK (share of same-band peers strictly below, 0–100) and present it
as "top X% for {band}" at the edge (X = 100 − rank).

Density gating (per-skill) lives at the call site: only show a per-skill
percentile when the (band, skill) cell has ≥ MIN_BAND_PEERS peers, else the
number is noise.
"""

from __future__ import annotations

MIN_BAND_PEERS = 20  # per-skill percentile hidden below this many same-band peers


def percentile_rank(value: float, peers: list[float]) -> float:
    """Share of ``peers`` STRICTLY below ``value``, as 0–100 (1 dp).

    Honest tie semantics: peers equal to ``value`` do not count as "below", so
    a cluster of tied scores all report the same rank. ``peers`` includes the
    subject; an empty/singleton population reports 0.0 (nothing to rank against).
    """
    n = len(peers)
    if n <= 1:
        return 0.0
    below = sum(1 for x in peers if x < value)
    return round(below / n * 100, 1)


def band_percentiles(scores: list[float]) -> list[float]:
    """Percentile rank for every score against its own list (same band)."""
    return [percentile_rank(s, scores) for s in scores]


def rank_within_band(
    user_total: float,
    band: str,
    band_scores: list[tuple[str, float]],
) -> float:
    """Percentile rank of ``user_total`` among same-``band`` peers.

    ``band_scores`` is the whole scored population as (resolved_band, total)
    pairs; band resolution (seniority → band) is the caller's job so this stays
    pure. Returns 0.0 when the band has ≤1 member.
    """
    peers = [total for b, total in band_scores if b == band]
    return percentile_rank(user_total, peers)


def top_percent(rank: float | None) -> int:
    """Present a percentile rank as the honest "top X%" headline.

    Higher rank ⇒ smaller (more selective) top-X. Floored at 1 so a band leader
    never reads "top 0%". None ⇒ 100 (unranked / thin population).
    """
    if rank is None:
        return 100
    return max(1, round(100 - rank))
