from __future__ import annotations

import pytest

from app.services.job_query_parser import parse_job_query


@pytest.mark.asyncio
async def test_parse_job_query_recognizes_post_mba_gurugram_without_provider() -> None:
    filters = await parse_job_query("Post MBA roles in Gurugram", provider=None)

    assert filters["location_city"] == "Gurugram"
    assert filters["location_country"] == "India"
    assert filters["location_mode"] is None
    assert "consultant" in filters["role"]
    assert "strategy" in filters["role"]
    assert "product manager" in filters["role"]
