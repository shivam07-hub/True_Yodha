"""Pure percentile math — band-relative rank + 'top X%' presentation."""

import pytest

from app.services.scoring.percentile import (
    band_percentiles,
    percentile_rank,
    top_percent,
)


class TestPercentileRank:
    def test_min_and_max(self) -> None:
        peers = [10.0, 20.0, 30.0, 40.0]
        assert percentile_rank(10.0, peers) == 0.0        # nobody below
        assert percentile_rank(40.0, peers) == 75.0       # 3 of 4 below

    def test_ties_share_rank(self) -> None:
        # Equal peers do not count as "below" — honest tie semantics.
        peers = [30.0, 30.0, 30.0, 10.0]
        assert percentile_rank(30.0, peers) == 25.0       # only the 10 is below

    def test_singleton_population_is_zero(self) -> None:
        assert percentile_rank(50.0, [50.0]) == 0.0
        assert percentile_rank(50.0, []) == 0.0

    def test_band_percentiles_maps_every_score(self) -> None:
        scores = [10.0, 20.0, 30.0]
        assert band_percentiles(scores) == [0.0, round(1 / 3 * 100, 1), round(2 / 3 * 100, 1)]


class TestTopPercent:
    def test_leader_never_reads_zero(self) -> None:
        assert top_percent(99.7) == 1
        assert top_percent(100.0) == 1

    def test_median_is_top_50(self) -> None:
        assert top_percent(50.0) == 50

    def test_bottom_is_top_100(self) -> None:
        assert top_percent(0.0) == 100

    def test_none_is_unranked(self) -> None:
        assert top_percent(None) == 100
