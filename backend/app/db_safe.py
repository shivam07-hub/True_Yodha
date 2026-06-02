"""Tolerant PostgREST execution seam.

PostgREST + postgrest-py have two failure modes that must never surface as a
500 to a user who is just browsing:

  1. The "204 / Missing response" quirk. postgrest-py raises
     ``APIError(code="204", message="Missing response")`` when ``.maybe_single()``
     (or certain selects) get an empty / No-Content body. There is no real
     error — it just means "no row".
  2. Schema-cache lag during a migration deploy
     (``PGRST204`` / ``PGRST205`` / "Could not find the 'X' column"). The code
     references a table/column the DB does not have *yet*. A read should degrade
     gracefully and a write should drop the not-yet-migrated column and retry —
     never 500 — while the migration catches up.

This module is the single place those quirks are absorbed, so that:

  * deploys are order-independent (ship code before or after the migration),
  * the postgrest-py 204 bug is pinned in exactly one place,
  * callers reason about one adapter instead of 28 ad-hoc ``maybe_single`` sites.

Reads degrade to a caller-supplied default and log a warning; they never raise
on the benign cases. Anything that is *not* one of the known-benign quirks is
re-raised untouched, so real bugs stay loud.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from postgrest.exceptions import APIError

logger = logging.getLogger(__name__)

# postgrest-py surfaces an empty / HTTP 204 body as this synthetic code — it
# means "no row", not a failure.
_EMPTY_RESPONSE_CODES = {"204"}
# PostgREST schema-cache lag: table/column not in the cache yet (migration not
# applied, or NOTIFY pgrst reload not yet processed).
_SCHEMA_LAG_CODES = {"PGRST204", "PGRST205"}

_MISSING_COLUMN_RE = re.compile(r"Could not find the '([^']+)' column")


def _err_code(exc: APIError) -> str:
    return str(getattr(exc, "code", "") or "")


def _err_message(exc: APIError) -> str:
    return str(getattr(exc, "message", "") or "")


def _is_benign_for_read(exc: APIError) -> bool:
    """True for the empty-body quirk and schema-cache lag — both mean "treat as
    no data" for a read, never a 500."""
    code = _err_code(exc)
    message = _err_message(exc)
    if code in _EMPTY_RESPONSE_CODES or "Missing response" in message:
        return True
    if code in _SCHEMA_LAG_CODES or "Could not find the" in message:
        return True
    return False


def missing_column(exc: APIError) -> str | None:
    """The column name from a PostgREST "Could not find the 'X' column" error,
    or ``None`` if this isn't that error. Used by tolerant writes to drop a
    not-yet-migrated column and retry."""
    match = _MISSING_COLUMN_RE.search(_err_message(exc))
    return match.group(1) if match else None


def safe_read(builder: Any, *, default: Any, context: str) -> Any:
    """Execute a PostgREST read query, absorbing the two quirks that must never
    500 a browsing user.

    ``builder`` is a query builder ready for ``.execute()`` (e.g. the result of
    ``client.table(...).select(...).eq(...).maybe_single()``). Returns the
    response ``.data`` on success, or ``default`` on an empty row / schema-cache
    lag. Re-raises any error that is not one of the known-benign quirks.
    """
    try:
        result = builder.execute()
    except APIError as exc:
        if _is_benign_for_read(exc):
            logger.warning("safe_read fell back to default [%s]: %s", context, exc)
            return default
        raise
    data = result.data if result is not None else None
    return default if data is None else data


def safe_profile_update(
    table: Any,
    payload: dict[str, Any],
    *,
    match_column: str,
    match_value: str,
    context: str,
) -> None:
    """Apply an UPDATE that survives schema-cache lag.

    If the DB does not yet have a column this payload writes (migration not
    applied), drop that column and retry rather than 500. Each not-yet-migrated
    column is best-effort; the legacy columns still persist. Bounded retries so
    a genuinely unsatisfiable payload still raises.
    """
    attempt = dict(payload)
    # +1 so an all-new-columns payload can drain to empty and stop cleanly.
    for _ in range(len(payload) + 1):
        if not attempt:
            return
        try:
            table.update(attempt).eq(match_column, match_value).execute()
            return
        except APIError as exc:
            column = missing_column(exc)
            if column and column in attempt:
                del attempt[column]
                logger.warning(
                    "safe_profile_update dropped not-yet-migrated column %r [%s]",
                    column,
                    context,
                )
                continue
            raise
