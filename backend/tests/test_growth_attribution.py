from __future__ import annotations

from typing import Any

from app.services import growth_attribution


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _Table:
    def __init__(self) -> None:
        self.upserts: list[tuple[dict[str, Any], dict[str, Any]]] = []

    def table(self, name: str) -> "_Table":
        assert name == "growth_attribution_touchpoints"
        return self

    def upsert(self, payload: dict[str, Any], **kwargs: Any) -> "_Table":
        self.upserts.append((payload, kwargs))
        return self

    def execute(self) -> _Result:
        return _Result([self.upserts[-1][0]])


def _attribution() -> dict[str, Any]:
    return {
        "first": {
            "source": "linkedin",
            "medium": "social",
            "campaign": "ai-map",
            "content": "founder-post",
            "term": None,
            "landing_path": "/newsletter/ai",
            "captured_at": "2026-06-01T08:00:00Z",
        },
        "latest": {
            "source": "google",
            "medium": "organic",
            "campaign": "cv-guide",
            "content": None,
            "term": None,
            "landing_path": "/guides/cv",
            "captured_at": "2026-06-02T08:00:00Z",
        },
    }


def test_record_signup_attribution_preserves_first_and_replaces_latest() -> None:
    db = _Table()

    recorded = growth_attribution.record_signup_attribution(
        db,
        user_id="user-1",
        attribution=_attribution(),
    )

    assert recorded is True
    first, latest = db.upserts
    assert first[0]["touch_kind"] == "first"
    assert first[1]["ignore_duplicates"] is True
    assert latest[0]["touch_kind"] == "latest"
    assert latest[1]["ignore_duplicates"] is False


def test_record_signup_attribution_skips_returning_user_login() -> None:
    db = _Table()

    recorded = growth_attribution.record_if_new_signup(
        db,
        user_id="user-1",
        is_new_signup=False,
        attribution=_attribution(),
    )

    assert recorded is False
    assert db.upserts == []


def test_record_signup_attribution_rejects_invalid_source() -> None:
    db = _Table()
    attribution = _attribution()
    attribution["first"]["source"] = "bad source!"

    recorded = growth_attribution.record_signup_attribution(
        db,
        user_id="user-1",
        attribution=attribution,
    )

    assert recorded is False
    assert db.upserts == []
