"""Mint Supabase passwordless sign-in links for app-owned delivery.

This is the auth half of the single email pathway: it produces a one-time
sign-in URL that the caller hands to ``email_service`` for delivery via Resend.
It owns only the identity dance — minting + auto-provisioning — never delivery.

ADR-0006 frictionless signup: a magic-link request for an unknown email
auto-creates a confirmed, passwordless account (mirrors the prior
``signInWithOtp(should_create_user=True)`` behavior) before minting the link.
Clicking the emailed link proves email ownership, so the pre-created account is
marked confirmed up front.

The "already exists" case is classified by duck-typing the raised error rather
than importing a concrete error class — the Supabase client's auth error type
moved between the ``gotrue`` and ``supabase_auth`` packages, and the codebase
never couples to either. Any error that is NOT a benign duplicate re-raises so
the caller's fail-soft path records a genuine failure.
"""

from __future__ import annotations

from typing import Any

_EXISTS_CODES = {"email_exists", "user_already_exists"}


def mint_login_link(admin: Any, *, email: str, redirect_to: str | None) -> str:
    """Return a one-time Supabase sign-in URL for ``email``.

    Creates the account first if it does not yet exist. Raises on any genuine
    failure (the caller treats a raise as "could not send").
    """
    _ensure_user(admin, email)

    options: dict[str, Any] = {}
    if redirect_to:
        options["redirect_to"] = redirect_to

    response = admin.auth.admin.generate_link(
        {"type": "magiclink", "email": email, "options": options}
    )
    return response.properties.action_link


def create_user_if_absent(admin: Any, email: str) -> str | None:
    """Create a confirmed passwordless user.

    Returns the new user's id when THIS call created the account, and None when
    the account already existed. That distinction is not cosmetic: partner SSO
    uses it as the account-takeover gate — an account we just created can be
    linked to the calling partner silently, an account that predates the call
    cannot, because nothing has proved the partner speaks for its owner.
    """
    try:
        created = admin.auth.admin.create_user({"email": email, "email_confirm": True})
    except Exception as exc:  # noqa: BLE001 — classified below, genuine errors re-raised
        if _is_already_exists(exc):
            return None
        raise
    user = getattr(created, "user", None)
    return str(user.id) if user and getattr(user, "id", None) else None


def _ensure_user(admin: Any, email: str) -> None:
    """Create the account if it does not exist; a duplicate is the expected
    returning-user case."""
    create_user_if_absent(admin, email)


def _is_already_exists(exc: Exception) -> bool:
    code = getattr(exc, "code", None)
    if code in _EXISTS_CODES:
        return True
    return getattr(exc, "status", None) == 422 and "already" in str(exc).lower()
