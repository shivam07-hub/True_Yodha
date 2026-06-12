from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin
from app.schemas.growth import (
    GrowthMessageUpdate,
    LegacyGrowthImport,
    LegacyGrowthImportResult,
    PublicationCreate,
)


class GrowthRecordNotFoundError(ValueError):
    pass


class GrowthRepository:
    def __init__(self, db: Client) -> None:
        self.db = db

    def list_command_center(self) -> dict[str, object]:
        assets = self._recent("growth_content_assets")
        campaigns = self._recent("growth_campaigns")
        messages = self._recent("growth_messages")
        publications = self._recent("growth_publications", order_by="published_at")
        return {
            "assets": assets,
            "campaigns": campaigns,
            "messages": messages,
            "publications": publications,
            "summary": {
                "assets": len(assets),
                "campaigns": len(campaigns),
                "needs_review": sum(
                    row.get("status") == "ready_for_review" for row in messages
                ),
                "published": sum(
                    row.get("status") == "published" for row in publications
                ),
            },
        }

    def update_message(
        self, message_id: str, body: GrowthMessageUpdate
    ) -> dict[str, Any]:
        payload = body.model_dump(mode="json", exclude_unset=True)
        payload["updated_at"] = _now()
        rows = _rows(
            self.db.table("growth_messages")
            .update(payload)
            .eq("id", message_id)
            .execute()
        )
        return _require_row(rows, message_id)

    def approve_message(
        self, message_id: str, operator_id: str
    ) -> dict[str, Any]:
        now = _now()
        rows = _rows(
            self.db.table("growth_messages")
            .update(
                {
                    "status": "approved",
                    "reviewer_id": operator_id,
                    "approved_at": now,
                    "updated_at": now,
                }
            )
            .eq("id", message_id)
            .execute()
        )
        return _require_row(rows, message_id)

    def mark_published(
        self,
        message_id: str,
        body: PublicationCreate,
        operator_id: str,
    ) -> dict[str, Any]:
        payload = body.model_dump(mode="json")
        payload.update(
            {
                "message_id": message_id,
                "published_at": payload.get("published_at") or _now(),
                "created_by": operator_id,
            }
        )
        publication = _require_row(
            _rows(
                self.db.table("growth_publications")
                .insert(payload)
                .execute()
            ),
            message_id,
        )
        message_status = "failed" if body.status == "failed" else "published"
        self.db.table("growth_messages").update(
            {
                "status": message_status,
                "failure_reason": body.failure_details,
                "updated_at": _now(),
            }
        ).eq("id", message_id).execute()
        return publication

    def upsert_asset(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._upsert_legacy("growth_content_assets", payload)

    def upsert_campaign(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._upsert_legacy("growth_campaigns", payload)

    def import_legacy(
        self, body: LegacyGrowthImport
    ) -> LegacyGrowthImportResult:
        batches = (
            ("growth_content_assets", body.assets),
            ("growth_campaigns", body.campaigns),
            ("growth_messages", body.messages),
            ("growth_publications", body.publications),
        )
        for table, rows in batches:
            if rows:
                self.db.table(table).upsert(
                    rows,
                    on_conflict="legacy_key",
                    ignore_duplicates=False,
                ).execute()
        return LegacyGrowthImportResult(
            assets=len(body.assets),
            campaigns=len(body.campaigns),
            messages=len(body.messages),
            publications=len(body.publications),
        )

    def _recent(
        self, table: str, *, order_by: str = "updated_at"
    ) -> list[dict[str, Any]]:
        return _rows(
            self.db.table(table)
            .select("*")
            .order(order_by, desc=True)
            .limit(500)
            .execute()
        )

    def _upsert_legacy(
        self, table: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        if not payload.get("legacy_key"):
            raise ValueError("legacy_key is required for idempotent upsert")
        rows = _rows(
            self.db.table(table)
            .upsert(
                payload,
                on_conflict="legacy_key",
                ignore_duplicates=False,
            )
            .execute()
        )
        return _require_row(rows, str(payload["legacy_key"]))


def get_growth_repository(
    db: Client = Depends(get_supabase_admin),
) -> GrowthRepository:
    return GrowthRepository(db)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rows(result: Any) -> list[dict[str, Any]]:
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    return []


def _require_row(
    rows: list[dict[str, Any]], record_id: str
) -> dict[str, Any]:
    if not rows:
        raise GrowthRecordNotFoundError(record_id)
    return rows[0]
