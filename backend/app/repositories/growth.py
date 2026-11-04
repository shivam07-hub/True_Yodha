from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin
from app.schemas.growth import (
    GrowthMessageUpdate,
    GrowthMetricUpdate,
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
        sweeps = self._recent("growth_seeding_sweeps", order_by="sweep_date")
        return {
            "assets": assets,
            "campaigns": campaigns,
            "messages": messages,
            "publications": publications,
            "sweeps": sweeps,
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
                "final_copy": body.final_copy_snapshot,
                "failure_reason": body.failure_details,
                "updated_at": _now(),
            }
        ).eq("id", message_id).execute()
        return publication

    def has_live_publication(self, message_id: str) -> bool:
        return bool(
            _rows(
                self.db.table("growth_publications")
                .select("id")
                .eq("message_id", message_id)
                .eq("status", "published")
                .limit(1)
                .execute()
            )
        )

    def claim_for_instagram(
        self, message_id: str, stale_before: str
    ) -> dict[str, Any] | None:
        """Move an Instagram carousel to `queued`, or return None if it is not free.

        Free means not yet out, or failed, or queued so long ago that the run
        holding it cannot still be alive.
        """
        claim = {"status": "queued", "failure_reason": None, "updated_at": _now()}

        def base() -> Any:
            return (
                self.db.table("growth_messages")
                .update(claim)
                .eq("id", message_id)
                .eq("channel", "instagram")
                .eq("format", "carousel")
            )

        rows = _rows(
            base().in_("status", ["ready_for_review", "approved", "failed"]).execute()
        )
        if not rows:
            rows = _rows(
                base().eq("status", "queued").lt("updated_at", stale_before).execute()
            )
        return rows[0] if rows else None

    def instagram_media_id(self, message_id: str) -> str | None:
        rows = _rows(
            self.db.table("growth_messages")
            .select("metadata")
            .eq("id", message_id)
            .limit(1)
            .execute()
        )
        metadata = (rows[0].get("metadata") if rows else None) or {}
        media_id = metadata.get("instagram_media_id")
        return str(media_id) if media_id else None

    def record_instagram_media(self, message_id: str, media_id: str) -> None:
        rows = _rows(
            self.db.table("growth_messages")
            .select("metadata")
            .eq("id", message_id)
            .limit(1)
            .execute()
        )
        metadata = dict(_require_row(rows, message_id).get("metadata") or {})
        metadata["instagram_media_id"] = media_id
        self.db.table("growth_messages").update(
            {"metadata": metadata, "updated_at": _now()}
        ).eq("id", message_id).execute()

    def fail_message(self, message_id: str, reason: str) -> None:
        self.db.table("growth_messages").update(
            {"status": "failed", "failure_reason": reason[:2000], "updated_at": _now()}
        ).eq("id", message_id).execute()

    def store_public_jpegs(
        self, bucket: str, folder: str, images: list[bytes]
    ) -> list[str]:
        store = self.db.storage.from_(bucket)
        urls = []
        for index, data in enumerate(images, start=1):
            path = f"{folder}/{index:02d}.jpg"
            store.upload(path, data, {"content-type": "image/jpeg", "upsert": "true"})
            urls.append(store.get_public_url(path).rstrip("?"))
        return urls

    def update_publication_metrics(
        self,
        publication_id: str,
        body: GrowthMetricUpdate,
    ) -> dict[str, Any]:
        existing = _require_row(
            _rows(
                self.db.table("growth_publications")
                .select("*")
                .eq("id", publication_id)
                .limit(1)
                .execute()
            ),
            publication_id,
        )
        outcome = dict(existing.get("outcome") or {})
        outcome.update(body.model_dump(exclude_none=True))
        return _require_row(
            _rows(
                self.db.table("growth_publications")
                .update({"outcome": outcome})
                .eq("id", publication_id)
                .execute()
            ),
            publication_id,
        )

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
            ("growth_seeding_sweeps", body.sweeps),
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
            sweeps=len(body.sweeps),
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
