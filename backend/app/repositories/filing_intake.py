"""The ₹599 filing process: role, cities, career pages, consent, payment."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin
from app.db_safe import safe_read
from app.deps import get_user_db

INTAKE_COLUMNS = (
    "user_id",
    "target_role",
    "cities",
    "portals",
    "consented_at",
    "paid_at",
)


def intake_error(*, role: str, cities: str, portals: str, consent: bool) -> str | None:
    if not consent:
        return "consent"
    if not role.strip() or not cities.strip() or not portals.strip():
        return "incomplete"
    return None


class FilingIntakeRepository:
    def __init__(self, db: Client, admin_db: Client) -> None:
        self._db = db
        self._admin = admin_db

    def get(self, user_id: str) -> dict[str, Any] | None:
        row = safe_read(
            self._db.table("filing_intakes")
            .select(",".join(INTAKE_COLUMNS))
            .eq("user_id", user_id)
            .limit(1),
            default=[],
            context="filing_intake",
        )
        if not row:
            return None
        return row[0]

    def save(
        self,
        *,
        user_id: str,
        role: str,
        cities: str,
        portals: str,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        existing = safe_read(
            self._admin.table("filing_intakes")
            .select("user_id, paid_at")
            .eq("user_id", user_id)
            .limit(1),
            default=[],
            context="filing_intake_paid",
        )
        payload = {
            "target_role": role.strip(),
            "cities": cities.strip(),
            "portals": portals.strip(),
            "consented_at": now,
        }
        if existing:
            self._admin.table("filing_intakes").update(payload).eq("user_id", user_id).execute()
        else:
            self._admin.table("filing_intakes").insert({"user_id": user_id, **payload}).execute()
        row = safe_read(
            self._admin.table("filing_intakes")
            .select(",".join(INTAKE_COLUMNS))
            .eq("user_id", user_id)
            .limit(1),
            default=[],
            context="filing_intake_saved",
        )
        if row:
            return row[0]
        return {"user_id": user_id, **payload, "paid_at": (existing[0].get("paid_at") if existing else None)}

    def mark_paid(self, user_id: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        existing = safe_read(
            self._admin.table("filing_intakes")
            .select("user_id")
            .eq("user_id", user_id)
            .limit(1),
            default=[],
            context="filing_intake_mark_paid",
        )
        if existing:
            self._admin.table("filing_intakes").update({"paid_at": now}).eq("user_id", user_id).execute()
            return
        self._admin.table("filing_intakes").insert(
            {
                "user_id": user_id,
                "target_role": "",
                "cities": "",
                "portals": "",
                "consented_at": now,
                "paid_at": now,
            }
        ).execute()


def get_filing_intake_repository(db: Client = Depends(get_user_db)) -> FilingIntakeRepository:
    return FilingIntakeRepository(db, get_supabase_admin())
