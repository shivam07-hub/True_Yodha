"""The reviewer-operations guard.

Every human-reviewed deliverable — the ₹99 Job-Switch Plan and the ₹999 AI
Workflow Audit — has the same back-of-house need: a founder advancing a queue.
One header, one token, one definition, so a second product cannot quietly ship
a weaker check than the first.

The setting is still named `job_switch_admin_token` because it is already set in
Railway and Vercel and renaming an env var is an infrastructure change, not a
code one. The name is historical; the credential is the reviewer's.
"""
from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, status

from app.config import settings

ADMIN_HEADER = "X-Myro-Admin-Token"


def require_admin(x_myro_admin_token: str | None = Header(default=None)) -> None:
    """Reject anything without the reviewer token.

    Answers 503 rather than 401 when no token is configured: an unset secret is
    a deployment fault, not a caller's bad credential, and reporting it as 401
    sends whoever is debugging to look in the wrong place. It also means an
    unconfigured environment cannot be walked into with an empty header.
    """
    expected = settings.job_switch_admin_token.strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Reviewer endpoints are not configured.",
        )
    supplied = (x_myro_admin_token or "").strip()
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token."
        )
