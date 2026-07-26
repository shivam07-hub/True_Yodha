"""Translate Supabase auth failures into actionable HTTP errors.

Every signup failure used to collapse into one 400 "Could not create the
account. Please try again." — advice that re-runs the exact call that just
failed. The most common failure on a signup form is `user_already_exists`,
which has a real next action (sign in), and the second most common is
`email_not_confirmed` on login, which was being reported as "Invalid email or
password" — telling the user the one thing that is NOT wrong. Both are
dead ends that read as the product being broken.

Contract: every mapped failure returns `detail = {"code", "message"}` so the
frontend can branch on the code instead of string-matching prose. Genuinely
unknown failures still degrade to the generic message — this narrows the
dead-end set, it does not invent certainty.

Enumeration note: signup answers "does this email have an account?" on
purpose. Supabase's own /signup already returns 422 `user_already_exists`
to any caller, so the obscurity was never actually held; and per PV1 a Myro
identity is an email the user chose (throwaway ones are expected and
supported), not a real-world identity. The recovery beat is worth more than
obscurity we do not have. Login stays deliberately generic.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status

# Supabase error codes we can act on. Anything absent → generic.
_EMAIL_TAKEN = {"user_already_exists", "email_exists", "identity_already_exists"}
_RATE_LIMITED = {"over_request_rate_limit", "over_email_send_rate_limit"}
_SIGNUP_CLOSED = {"signup_disabled", "email_provider_disabled", "provider_disabled"}

_GENERIC_SIGNUP = "Could not create the account. Please try again."
_GENERIC_LOGIN = "Invalid email or password."


def auth_error_code(exc: Exception) -> str | None:
    """Supabase's machine code for an auth failure, when it carries one.

    Logging `type(exc).__name__` gave us `AuthApiError` and nothing else —
    every distinct failure looked identical in prod logs.
    """
    code = getattr(exc, "code", None)
    return code if isinstance(code, str) and code else None


def _detail(code: str, message: str, **extra: Any) -> dict[str, Any]:
    return {"code": code, "message": message, **extra}


def _weak_password_reasons(exc: Exception) -> list[str]:
    reasons = getattr(exc, "reasons", None)
    return [r for r in reasons if isinstance(r, str)] if isinstance(reasons, list) else []


def signup_http_error(exc: Exception) -> HTTPException:
    """Map a Supabase sign-up failure to the most actionable HTTP error."""
    code = auth_error_code(exc)

    if code in _EMAIL_TAKEN:
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_detail(
                "email_taken",
                "That email already has a Myro account. Sign in instead.",
            ),
        )

    if code == "weak_password":
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=_detail(
                "weak_password",
                "Pick a stronger password — at least 8 characters.",
                reasons=_weak_password_reasons(exc),
            ),
        )

    if code in {"email_address_invalid", "validation_failed"}:
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=_detail("invalid_email", "That email address isn't valid."),
        )

    if code == "email_address_not_authorized":
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_detail(
                "email_not_allowed",
                "We can't send mail to that address. Try another email.",
            ),
        )

    if code in _RATE_LIMITED:
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_detail(
                "rate_limited",
                "Too many attempts. Wait a minute, then try again.",
            ),
            headers={"Retry-After": "60"},
        )

    if code in _SIGNUP_CLOSED:
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_detail(
                "signup_unavailable",
                "Sign-ups are paused right now. Try again shortly.",
            ),
        )

    if code == "user_banned":
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_detail(
                "account_blocked",
                "This account is blocked. Contact support@himyro.com.",
            ),
        )

    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=_detail("signup_failed", _GENERIC_SIGNUP),
    )


def login_http_error(exc: Exception) -> HTTPException:
    """Map a Supabase sign-in failure.

    Stays generic for wrong-credential cases on purpose (login IS an
    enumeration oracle if it distinguishes "no such user" from "wrong
    password"). Only failures the user must act on differently get their own
    code — an unconfirmed email cannot be fixed by retyping the password.
    """
    code = auth_error_code(exc)

    if code == "email_not_confirmed":
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_detail(
                "email_not_confirmed",
                "Confirm your email first — we can send you a sign-in link instead.",
            ),
        )

    if code in _RATE_LIMITED:
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_detail(
                "rate_limited",
                "Too many attempts. Wait a minute, then try again.",
            ),
            headers={"Retry-After": "60"},
        )

    if code == "user_banned":
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_detail(
                "account_blocked",
                "This account is blocked. Contact support@himyro.com.",
            ),
        )

    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=_detail("invalid_credentials", _GENERIC_LOGIN),
    )
