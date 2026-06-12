from __future__ import annotations

from typing import Any

from app.repositories.growth import GrowthRepository
from app.schemas.growth import GrowthMessageUpdate, PublicationCreate


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _RecordingDB:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.current: dict[str, Any] = {}

    def table(self, name: str) -> "_RecordingDB":
        self.current = {"table": name, "filters": []}
        return self

    def select(self, columns: str = "*") -> "_RecordingDB":
        self.current.update(op="select", columns=columns)
        return self

    def insert(self, payload: Any) -> "_RecordingDB":
        self.current.update(op="insert", payload=payload)
        return self

    def update(self, payload: Any) -> "_RecordingDB":
        self.current.update(op="update", payload=payload)
        return self

    def upsert(self, payload: Any, **kwargs: Any) -> "_RecordingDB":
        self.current.update(op="upsert", payload=payload, kwargs=kwargs)
        return self

    def eq(self, key: str, value: Any) -> "_RecordingDB":
        self.current["filters"].append((key, value))
        return self

    def order(self, key: str, **kwargs: Any) -> "_RecordingDB":
        self.current.update(order=(key, kwargs))
        return self

    def limit(self, value: int) -> "_RecordingDB":
        self.current["limit"] = value
        return self

    def execute(self) -> _Result:
        call = {**self.current, "filters": list(self.current.get("filters", []))}
        self.calls.append(call)
        table = call["table"]
        op = call.get("op")
        if op == "select":
            rows = {
                "growth_content_assets": [{"id": "asset-1", "status": "published"}],
                "growth_campaigns": [{"id": "campaign-1", "status": "active"}],
                "growth_messages": [{"id": "message-1", "status": "ready_for_review"}],
                "growth_publications": [{"id": "publication-1", "status": "published"}],
            }
            return _Result(rows.get(table, []))
        if table == "growth_messages" and op == "update":
            return _Result([{"id": "message-1", **call["payload"]}])
        if table == "growth_publications" and op == "insert":
            return _Result([{"id": "publication-1", **call["payload"]}])
        if op == "upsert":
            payload = call["payload"]
            row = payload[0] if isinstance(payload, list) else payload
            return _Result([row])
        return _Result([])


def test_command_center_lists_each_growth_record_type() -> None:
    result = GrowthRepository(_RecordingDB()).list_command_center()

    assert result["summary"] == {
        "assets": 1,
        "campaigns": 1,
        "needs_review": 1,
        "published": 1,
    }
    assert result["messages"][0]["id"] == "message-1"


def test_message_edit_only_writes_supplied_fields() -> None:
    db = _RecordingDB()

    result = GrowthRepository(db).update_message(
        "message-1",
        GrowthMessageUpdate(final_copy="A clearer final post.", status="ready_for_review"),
    )

    call = next(call for call in db.calls if call["table"] == "growth_messages")
    assert call["filters"] == [("id", "message-1")]
    assert call["payload"]["final_copy"] == "A clearer final post."
    assert "draft_copy" not in call["payload"]
    assert result["id"] == "message-1"


def test_approval_records_operator_and_timestamp() -> None:
    db = _RecordingDB()

    result = GrowthRepository(db).approve_message("message-1", "operator-1")

    call = next(call for call in db.calls if call["table"] == "growth_messages")
    assert call["payload"]["status"] == "approved"
    assert call["payload"]["reviewer_id"] == "operator-1"
    assert call["payload"]["approved_at"]
    assert result["status"] == "approved"


def test_mark_published_creates_immutable_record_then_updates_message() -> None:
    db = _RecordingDB()

    result = GrowthRepository(db).mark_published(
        "message-1",
        PublicationCreate(
            live_url="https://www.linkedin.com/feed/update/urn:li:activity:1",
            external_id="urn:li:activity:1",
        ),
        operator_id="operator-1",
    )

    assert [call["table"] for call in db.calls] == [
        "growth_publications",
        "growth_messages",
    ]
    assert db.calls[0]["payload"]["message_id"] == "message-1"
    assert db.calls[1]["payload"]["status"] == "published"
    assert result["live_url"].startswith("https://www.linkedin.com/")


def test_asset_and_campaign_upserts_use_stable_legacy_keys() -> None:
    db = _RecordingDB()
    repo = GrowthRepository(db)

    repo.upsert_asset({"legacy_key": "tracker:issue:7", "title": "Issue 7"})
    repo.upsert_campaign(
        {"legacy_key": "tracker:campaign:7", "name": "Issue 7 distribution"}
    )

    assert db.calls[0]["kwargs"]["on_conflict"] == "legacy_key"
    assert db.calls[1]["kwargs"]["on_conflict"] == "legacy_key"
