from __future__ import annotations

import pytest

from app.services.job_intelligence_policy import is_recommendable_listing


@pytest.mark.parametrize(
    ("row", "expected"),
    [
        ({"is_active": True, "listing_confidence": "active"}, True),
        ({"is_active": True, "listing_confidence": "uncertain"}, False),
        ({"is_active": True, "listing_confidence": "likely_closed"}, False),
        ({"is_active": True, "listing_confidence": "closed"}, False),
        ({"is_active": False, "listing_confidence": "active"}, False),
        ({"is_active": True}, False),
    ],
)
def test_only_explicitly_active_listings_are_recommendable(
    row: dict[str, object], expected: bool
) -> None:
    assert is_recommendable_listing(row) is expected
