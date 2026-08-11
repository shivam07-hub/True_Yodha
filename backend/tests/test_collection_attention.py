from datetime import datetime, timedelta, timezone

from app.services.collection_attention import _copy, _target_level


NOW = datetime(2026, 7, 19, tzinfo=timezone.utc)


def test_saved_attention_advances_through_each_checkpoint() -> None:
    assert _target_level(NOW - timedelta(hours=23), NOW) is None
    assert _target_level(NOW - timedelta(days=1), NOW) == "review"
    assert _target_level(NOW - timedelta(days=3), NOW) == "decide"
    assert _target_level(NOW - timedelta(days=7), NOW) == "urgent"


def test_urgent_attention_uses_live_listing_language_without_invented_deadline() -> None:
    title, body = _copy("urgent", "Product Designer", "Myro")

    assert title == "Decide on this saved role today"
    assert body == "Myro · Product Designer is still live. Open Collections to tailor, apply, or pass."
    assert "closes" not in body
