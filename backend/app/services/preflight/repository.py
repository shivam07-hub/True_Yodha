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

import logging
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, HTTPException, status
from supabase import Client

from app.db_safe import safe_read
from app.deps import get_user_db
from app.repositories.users import UsersRepository
from app.services.matching import targeting
from app.services.preflight import memory_import
from app.services.preflight.lines import Order, merge_imports

_TABLE = "preflight_orders"

logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class OrderBundle:
    """One read, everything the pre-flight opens on."""

    order: Order
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

    def load_stored(self, user_id: str) -> Order:
        """The row exactly as stored. ONE read, no imports, no CV lookup.

        This is what a WRITE needs, and what a RUN needs. Both used to call
        `load_bundle`, so answering one line re-read the profile, re-scanned
        `user_memory`, re-imported every note and counted the user's CV
        versions before it touched the order — five sequential round trips at a
        documented ~165ms floor each, which is the 1.5-4.1s per tap in the
        2026-08-21 logs.

        Safe to skip the import only because the open MATERIALISES it: a guess
        exists as a stored line before the client is ever shown its id. Without
        that, every yes on a guess would 404 here.

        The run reads this too, and that is a correctness fix, not just a speed
        one. Merging at run time folded in any note the distiller had written
        since the modal opened, and `drop_unanswered` then buried it as a
        permanent tombstone the user was never shown — and `merge_imports`
        keeps answered lines forever, so it could never be asked again.
        """
        return Order.from_dict(self._row(user_id))

    def load_bundle(self, user_id: str) -> "OrderBundle":
        """What the modal opens on — and the one place imports happen.

        `merge_imports` is idempotent, so this writes only on the open that
        actually learns something: the first one after the distiller files a
        note. Every other open, and every write, reads a row that already says
        everything Myro wants to ask.
        """
        brief = targeting.for_preflight(self._db, user_id)
        stored = Order.from_dict(self._row(user_id))
        candidates = memory_import.confirmed_from(brief) + memory_import.guesses_from(brief)
        merged = merge_imports(stored, candidates)

        if merged.lines != stored.lines:
            written = self._write(user_id, merged, expected=stored.updated_at)
            # Lost the race: another open materialised the same imports a moment
            # ago. Its row is as good as ours — take it rather than clobber it.
            merged = written if written is not None else self.load_stored(user_id)

        return OrderBundle(
            order=merged,
            memory_count=len(brief.facts),
            # `cv_readiness` is NOT a user_profiles column — GET /users/me derives
            # it from `has_baseline_cv`. Reading it off the profile dict returned
            # None for everyone, so the review screen told users with a CV on file
            # "No CV yet · add one" and sent them to a storage URL that asks for a
            # login. Ask the canonical question instead.
            cv_readiness="ready" if UsersRepository(self._db).has_baseline_cv(user_id) else "missing",
        )

    def save(self, user_id: str, order: Order, *, ticket_id: str | None = None) -> Order:
        """Unconditional write. The ONE caller is the run stamp, and there
        last-writer-wins is the correct rule rather than a compromise: the run
        has already been dispatched from exactly this order, so the row has to
        end up matching what actually ran. Every other write goes through
        `mutate` and its compare-and-set."""
        payload: dict[str, Any] = {
            "user_id": user_id,
            "said": order.said,
            "lines": [line.to_dict() for line in order.lines],
            "log": [entry.to_dict() for entry in order.log],
            "updated_at": now_iso(),
        }
        if ticket_id:
            payload["last_run_at"] = payload["updated_at"]
            payload["last_ticket_id"] = ticket_id
        self._db.table(_TABLE).upsert(payload, on_conflict="user_id").execute()
        return Order(
            said=order.said,
            lines=order.lines,
            log=order.log,
            updated_at=payload["updated_at"],
            last_run_at=payload.get("last_run_at", order.last_run_at),
            last_ticket_id=ticket_id or order.last_ticket_id,
        )

    def mutate(self, user_id: str, apply: "Callable[[Order], Order]", *, attempts: int = 4) -> Order:
        """Read-modify-write the order under compare-and-set.

        TWO round trips: read the stored row, write it back under compare-and-
        set. It was five, because this read the merged bundle — see
        `load_stored`.

        `lines` is one jsonb document, so every answer rewrites the whole array.
        Two clicks in flight at once — which is what tapping `yes` down a list of
        thirteen produces — both read the same array and the second write erases
        the first user's answer. Silently: the response looks right, the row is
        wrong, and the run is dispatched from the row.

        So the update is conditional on the `updated_at` it read. A loser
        re-reads and re-applies rather than clobbering, and the operation is
        expressed as a function of the CURRENT order precisely so replaying it is
        meaningful. Client-side serialisation makes this rare; it does not make
        it impossible, and two tabs make it certain.
        """
        for attempt in range(attempts):
            bundle_order = self.load_stored(user_id)
            expected = bundle_order.updated_at
            next_order = apply(bundle_order)
            written = self._write(user_id, next_order, expected=expected)
            if written is not None:
                return written
            logger.info("metric preflight.order_write_retry user=%s attempt=%s", user_id, attempt + 1)
        # Every attempt lost. Better to fail the click than to overwrite an
        # answer the user cannot see was lost.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your order changed somewhere else. Reopen it and try that again.",
        )

    def _write(self, user_id: str, order: Order, *, expected: str | None) -> Order | None:
        """Persist iff the row still carries `expected`. None means someone
        else wrote first."""
        stamp = now_iso()
        payload: dict[str, Any] = {
            "said": order.said,
            "lines": [line.to_dict() for line in order.lines],
            "log": [entry.to_dict() for entry in order.log],
            "updated_at": stamp,
        }
        if expected is None:
            # No row yet. Upsert: the only way to lose here is two concurrent
            # FIRST-EVER writes for one user, where last-writer-wins is the
            # same outcome either way.
            self._db.table(_TABLE).upsert({**payload, "user_id": user_id}, on_conflict="user_id").execute()
        else:
            result = (
                self._db.table(_TABLE)
                .update(payload)
                .eq("user_id", user_id)
                .eq("updated_at", expected)
                .execute()
            )
            if not (result.data or []):
                return None
        return replace(order, updated_at=stamp)

    def recent_run(self, user_id: str, *, within_seconds: int) -> str | None:
        """The ticket this order started moments ago, if it is still that recent.

        The idempotency key for POST /preflight/run. A client-side in-flight
        guard is necessary and not sufficient — it does not survive two tabs, a
        reload, or a retry after a timeout, and every extra call that reaches the
        server is another 100 coins off the user's wallet.
        """
        row = self._row(user_id) or {}
        ticket = (row.get("last_ticket_id") or "").strip()
        stamped = row.get("last_run_at")
        if not ticket or not stamped:
            return None
        try:
            started = datetime.fromisoformat(str(stamped).replace("Z", "+00:00"))
        except ValueError:
            return None
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - started).total_seconds()
        return ticket if 0 <= age <= within_seconds else None


def get_order_repository(db: Client = Depends(get_user_db)) -> OrderRepository:
    return OrderRepository(db)
