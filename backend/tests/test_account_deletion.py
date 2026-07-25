from __future__ import annotations

from app.services import account_deletion


def test_account_deletion_runs_storage_database_and_auth_in_order(monkeypatch) -> None:
    events: list[str] = []
    db = object()

    monkeypatch.setattr(
        account_deletion,
        "_delete_storage_objects",
        lambda user_id: events.append(f"storage:{user_id}"),
    )
    monkeypatch.setattr(
        account_deletion,
        "_delete_database_data",
        lambda scoped_db: events.append("database") if scoped_db is db else None,
    )
    monkeypatch.setattr(
        account_deletion,
        "_delete_auth_user",
        lambda user_id: events.append(f"auth:{user_id}"),
    )
    monkeypatch.setattr(
        account_deletion,
        "forget_provisioned_user",
        lambda user_id: events.append(f"cache:{user_id}"),
    )

    account_deletion.delete_account("user-1", db)

    assert events == [
        "cache:user-1",
        "storage:user-1",
        "database",
        "auth:user-1",
    ]
