"""Load and persist the Order. The single source of truth for BOTH surfaces.

The pre-flight gate and the market bottom-sheet read and write the same row, so
a change applied from the market is in the gate's brief on the next read, and a
line confirmed in the gate can be struck from the market. That is the whole
point of the record; two stores would put the two surfaces back to disagreeing,
which is the state this replaced.

Formatting belongs to the frontend's `lib/preflight/prose` — one pure module
consumed by both surfaces is the only way "both render the identical order
string" is literally true. Nothing here builds prose.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends
from supabase import Client

from app.db_safe import safe_read
from app.deps import get_user_db
from app.services.matching import targeting
from app.services.preflight import memory_import
from app.services.preflight.lines import Order, merge_imports

_TABLE = "preflight_orders"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class OrderBundle:
    """One read, everything the pre-flight opens on."""

    order: Order
    starters: list[str]
    memory_count: int
    cv_readiness: str | None


class OrderRepository:
    def __init__(self, db: Client):
        self._db = db

    def _row(self, user_id: str) -> dict[str, Any] | None:
        rows = safe_read(
            self._db.table(_TABLE).select("*").eq("user_id", user_id).limit(1),
            default=[],
            context="preflight_order_read",
        )
        return rows[0] if rows else None

    def load(self, user_id: str) -> Order:
        """The stored order, with any guesses Myro has learned since last time
        folded in as unanswered. Never invents a status — see `merge_imports`."""
        return self.load_bundle(user_id).order

    def load_bundle(self, user_id: str) -> "OrderBundle":
        """Order + the two things screen 1 needs, off ONE targeting read.

        Split across three methods this cost three round trips to assemble one
        modal — the same profile SELECT and the same `user_memory` scan, thrice.
        The pre-flight opens on a click, so it is a read path: see
        ARCHITECTURE_READ_PATH.md.
        """
        brief = targeting.for_preflight(self._db, user_id)
        order = Order.from_dict(self._row(user_id))
        candidates = memory_import.confirmed_from(brief) + memory_import.guesses_from(brief)
        return OrderBundle(
            order=merge_imports(order, candidates),
            starters=memory_import.starters_from(brief),
            memory_count=len(brief.facts),
            cv_readiness=(brief.profile.get("cv_readiness") or "").strip() or None,
        )

    def save(self, user_id: str, order: Order, *, ran: bool = False) -> Order:
        payload: dict[str, Any] = {
            "user_id": user_id,
            "said": order.said,
            "lines": [line.to_dict() for line in order.lines],
            "log": [entry.to_dict() for entry in order.log],
            "updated_at": now_iso(),
        }
        if ran:
            payload["last_run_at"] = payload["updated_at"]
        self._db.table(_TABLE).upsert(payload, on_conflict="user_id").execute()
        return Order(
            said=order.said,
            lines=order.lines,
            log=order.log,
            updated_at=payload["updated_at"],
            last_run_at=payload.get("last_run_at", order.last_run_at),
        )


def get_order_repository(db: Client = Depends(get_user_db)) -> OrderRepository:
    return OrderRepository(db)
