"""In-memory Settlement store and an idempotent coin grant, shared by the
settlement and payments-router tests."""

from __future__ import annotations

import threading
from typing import Any

from app.services.billing_catalogue import by_alias

COIN_PACK = by_alias("xp_pack")


class InMemoryStore:
    """The Supabase adapter's contract, held in a dict behind a lock so two
    arrivals racing in threads see the same compare-and-set semantics."""

    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = {r["razorpay_order_id"]: dict(r) for r in rows}
        self._lock = threading.Lock()

    def row(self, order_id: str) -> dict[str, Any]:
        return self._rows[order_id]

    def find_by_order(self, order_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._rows.get(order_id)
            return dict(row) if row else None

    def claim(self, row_id: str, payment_id: str) -> bool:
        with self._lock:
            for row in self._rows.values():
                if row["id"] == row_id and row["status"] in ("created", "failed"):
                    row.update(status="verified", razorpay_payment_id=payment_id, grant_pending=True)
                    return True
            return False

    def finish(self, row_id: str) -> bool:
        with self._lock:
            for row in self._rows.values():
                if row["id"] == row_id and row["grant_pending"]:
                    row["grant_pending"] = False
                    return True
            return False

    def mark_failed(self, order_id: str) -> bool:
        with self._lock:
            row = self._rows.get(order_id)
            if row and row["status"] == "created":
                row["status"] = "failed"
                return True
            return False


class CoinLedger:
    """Idempotent on the payment row id, like `reward_coins`."""

    def __init__(self, balance: int = 3000) -> None:
        self.balance = balance
        self.rows: list[str] = []
        self.fail_next = 0
        self._lock = threading.Lock()

    async def grant(self, row: dict[str, Any]) -> int:
        if self.fail_next:
            self.fail_next -= 1
            raise RuntimeError("data api down")
        with self._lock:
            if row["id"] not in self.rows:
                self.rows.append(row["id"])
                self.balance += COIN_PACK.coins
            return self.balance
