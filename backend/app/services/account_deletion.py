"""Erase one account across private Storage, app data, and Supabase Auth."""

from __future__ import annotations

from typing import Any

from supabase import Client

from app.database import get_supabase_admin
from app.deps import forget_provisioned_user
from app.services.cv_workflow import CV_UPLOAD_BUCKET

_PAGE_SIZE = 1000
_REMOVE_BATCH_SIZE = 100


def _list_storage_paths(bucket: Any, root: str) -> list[str]:
    paths: list[str] = []
    pending = [root]
    while pending:
        prefix = pending.pop()
        offset = 0
        while True:
            rows = bucket.list(prefix, {"limit": _PAGE_SIZE, "offset": offset}) or []
            for row in rows:
                name = str(row.get("name") or "").strip()
                if not name:
                    continue
                path = f"{prefix}/{name}"
                if row.get("metadata") is None:
                    pending.append(path)
                else:
                    paths.append(path)
            if len(rows) < _PAGE_SIZE:
                break
            offset += _PAGE_SIZE
    return paths


def _delete_storage_objects(user_id: str) -> None:
    bucket = get_supabase_admin().storage.from_(CV_UPLOAD_BUCKET)
    paths = _list_storage_paths(bucket, user_id)
    for start in range(0, len(paths), _REMOVE_BATCH_SIZE):
        bucket.remove(paths[start : start + _REMOVE_BATCH_SIZE])


def _delete_database_data(db: Client) -> None:
    db.rpc("delete_my_account_data").execute()


def _delete_auth_user(user_id: str) -> None:
    get_supabase_admin().auth.admin.delete_user(user_id, should_soft_delete=False)


def delete_account(user_id: str, db: Client) -> None:
    """Delete synchronously; any failed stage aborts and is safe to retry."""
    forget_provisioned_user(user_id)
    _delete_storage_objects(user_id)
    _delete_database_data(db)
    _delete_auth_user(user_id)
