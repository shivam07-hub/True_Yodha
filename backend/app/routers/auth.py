"""Auth router.

Conventions:
- Email/password signup + login stay for legacy compatibility (110 users).
- ADR-0006 frictionless flow: OAuth (Google/LinkedIn) + magic-link land on
  Supabase, then call POST /auth/post-signin for SH7 ref attribution +
  LinkedIn metadata + one-time XP grants.
- POST /auth/magic-link-request wraps Supabase signInWithOtp with a
  3/hour/IP rate limit (magic_link_attempts table).
- DELETE /auth/integrations/{provider} revokes the linked Supabase
  identity (powers the v2 Settings → Integrations panel).
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Request, status

from app.database import get_supabase, get_supabase_admin
from app.deps import Principal, get_principal
from app.schemas import (
    AuthResponse,
    ExtensionSessionResponse,
    IntegrationRevokeResponse,
    LoginRequest,
    MagicLinkRequest,
    MagicLinkResponse,
    PostSigninRequest,
    PostSigninResponse,
    RefreshRequest,
    RefreshResponse,
    SignupRequest,
)
from app.services import auth_links, email_service
from app.services.growth_attribution import record_if_new_signup, record_signup_attribution
from app.services.user_provisioning import ensure_user_provisioned, set_linkedin_identity

router = APIRouter(prefix="/auth", tags=["auth"])
_log = logging.getLogger(__name__)

_REF_COOKIE = "myro_ref"
_MAGIC_LINK_WINDOW_MINUTES = 60
_MAGIC_LINK_MAX_PER_WINDOW = 3
_SUPPORTED_REVOKE_PROVIDERS = {"google", "linkedin_oidc"}


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else "0.0.0.0"


def _safe_user_agent(value: str | None) -> str | None:
    if not value:
        return None
    return value[:240]


def _select_referrer(
    body_ref: str | None,
    query_ref: str | None,
    cookie_ref: str | None,
) -> str | None:
    return body_ref or query_ref or cookie_ref


# ─── legacy email/password signup + login ──────────────────────────────────


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(
    body: SignupRequest,
    ref: str | None = Query(default=None),
    myro_ref: str | None = Cookie(default=None, alias=_REF_COOKIE),
) -> AuthResponse:
    try:
        response = get_supabase().auth.sign_up({
            "email": body.email,
            "password": body.password.get_secret_value(),
            "options": {"data": {"full_name": body.full_name}},
        })
    except Exception as exc:
        _log.warning("signup failed reason=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create the account. Please try again.",
        ) from exc

    if not response.user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Signup failed. Please try again.",
        )

    if not response.session:
        return AuthResponse(
            requires_email_confirmation=True,
            message="Check your email for a confirmation link, then sign in.",
        )

    referrer = _select_referrer(body.myro_ref, ref, myro_ref)
    try:
        ensure_user_provisioned(
            response.user.id,
            response.user.email,
            body.full_name,
            myro_ref=referrer,
        )
    except Exception as exc:
        _log.warning("signup provisioning failed reason=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not finish account setup. Please try again.",
        ) from exc

    if body.attribution:
        try:
            record_signup_attribution(
                get_supabase_admin(),
                user_id=response.user.id,
                attribution=body.attribution,
            )
        except Exception as exc:
            _log.warning("signup attribution failed reason=%s", type(exc).__name__)

    return AuthResponse(
        access_token=response.session.access_token,
        refresh_token=response.session.refresh_token,
    )


@router.post("/login", response_model=AuthResponse)
def login(
    body: LoginRequest,
    ref: str | None = Query(default=None),
    myro_ref: str | None = Cookie(default=None, alias=_REF_COOKIE),
) -> AuthResponse:
    try:
        response = get_supabase().auth.sign_in_with_password({
            "email": body.email,
            "password": body.password.get_secret_value(),
        })
    except Exception as exc:
        _log.warning("login failed reason=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        ) from exc

    if not response.user or not response.session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    ensure_user_provisioned(
        response.user.id,
        response.user.email,
        response.user.user_metadata.get("full_name") if response.user.user_metadata else None,
        myro_ref=_select_referrer(None, ref, myro_ref),
    )
    return AuthResponse(
        access_token=response.session.access_token,
        refresh_token=response.session.refresh_token,
    )


@router.post("/refresh", response_model=RefreshResponse)
def refresh_token(body: RefreshRequest) -> RefreshResponse:
    try:
        response = get_supabase().auth.refresh_session(body.refresh_token.get_secret_value())
    except Exception as exc:
        _log.warning("token refresh failed reason=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token refresh failed.",
        ) from exc

    if not response.session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token refresh failed")

    return RefreshResponse(
        access_token=response.session.access_token,
        refresh_token=response.session.refresh_token,
    )


@router.post("/extension-session", response_model=ExtensionSessionResponse)
def extension_session(
    principal: Principal = Depends(get_principal),
) -> ExtensionSessionResponse:
    """Mint a fresh, INDEPENDENT Supabase session for the browser extension.

    The extension carries a real Supabase access token (the backend feeds it to
    PostgREST for RLS — see deps.get_user_db). Handing it a copy of the web
    app's session would make both share one refresh-token family; Supabase
    rotates refresh tokens on use, so the two clients would eventually invalidate
    each other and one would be logged out at random. Minting a brand-new
    session here gives the extension its own family. The admin generate-link →
    verify-otp dance issues a session for the caller without a password and
    without sending any email.
    """
    if not principal.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your account has no email on file, so the extension can't be connected.",
        )

    try:
        link = get_supabase_admin().auth.admin.generate_link(
            {"type": "magiclink", "email": principal.email}
        )
        token_hash = link.properties.hashed_token
        # get_supabase() returns a fresh anon client (not lru_cached), so
        # verify_otp's internal _save_session won't pollute shared client state.
        verified = get_supabase().auth.verify_otp(
            {"token_hash": token_hash, "type": "magiclink"}
        )
    except Exception as exc:
        _log.warning("extension-session mint failed for %s: %s", principal.id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't connect the extension right now. Try again.",
        )

    session = getattr(verified, "session", None)
    if not session or not session.access_token or not session.refresh_token:
        _log.warning("extension-session mint returned no session for %s", principal.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't connect the extension right now. Try again.",
        )

    return ExtensionSessionResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_at=getattr(session, "expires_at", None),
    )


# ─── ADR-0006 ──────────────────────────────────────────────────────────────


@router.post("/post-signin", response_model=PostSigninResponse)
async def post_signin(
    body: PostSigninRequest,
    principal: Principal = Depends(get_principal),
    ref: str | None = Query(default=None),
    myro_ref: str | None = Cookie(default=None, alias=_REF_COOKIE),
) -> PostSigninResponse:
    """One-shot post-auth bootstrap.

    Always: provisions user_profiles (idempotent — first call inserts; later
    calls refresh email/full_name only). SH7 referral attribution flows
    from body.myro_ref first (CORS-stripped cookie fallback second).

    LinkedIn-only: persists `linkedin_url` + headline + verified status when
    the frontend mirrors the OIDC ID-token claims into the body. The XP
    grant flag (linkedin_xp_granted) prevents double-grants.

    Idempotent on every axis — safe to retry."""
    # principal is already validated by Depends(get_principal) — no extra
    # auth round-trip needed here. full_name flows from Supabase user_metadata
    # via ensure_user_provisioned's own admin read; pass None and let it stay
    # whatever the row already had.
    full_name: str | None = None
    referrer = _select_referrer(body.myro_ref, ref, myro_ref)
    try:
        referral_attributed = ensure_user_provisioned(
            principal.id,
            principal.email,
            full_name,
            myro_ref=referrer,
        )
    except Exception as exc:
        _log.warning("post-signin provisioning failed for %s: %s", principal.id, exc)
        referral_attributed = False

    linkedin_xp_granted = False
    linkedin_url_set = False
    attribution_recorded = False
    try:
        attribution_recorded = record_if_new_signup(
            get_supabase_admin(),
            user_id=principal.id,
            is_new_signup=body.is_new_signup,
            attribution=body.attribution,
        )
    except Exception as exc:
        _log.warning("post-signin attribution failed for %s: %s", principal.id, exc)

    is_linkedin = (body.provider or "").lower() in {"linkedin_oidc", "linkedin"}
    if is_linkedin and (body.linkedin_vanity or body.linkedin_headline):
        try:
            linkedin_xp_granted, linkedin_url_set = await set_linkedin_identity(
                principal.id,
                vanity=body.linkedin_vanity,
                headline=body.linkedin_headline,
                verified=body.linkedin_verified,
            )
        except Exception as exc:
            _log.warning("LinkedIn identity write failed for %s: %s", principal.id, exc)

    return PostSigninResponse(
        provider=body.provider,
        referral_attributed=bool(referral_attributed),
        attribution_recorded=attribution_recorded,
        linkedin_xp_granted=linkedin_xp_granted,
        linkedin_url_set=linkedin_url_set,
    )


@router.post("/magic-link-request", response_model=MagicLinkResponse)
def magic_link_request(
    body: MagicLinkRequest,
    request: Request,
    user_agent: str | None = Header(default=None, alias="User-Agent"),
) -> MagicLinkResponse:
    """ADR-0006 §10 — rate-limited magic-link send. 3 per hour per IP."""
    admin = get_supabase_admin()
    ip = _client_ip(request)
    email = body.email.lower().strip()

    try:
        count_resp = admin.rpc(
            "count_magic_link_attempts_ip",
            {"p_ip": ip, "p_minutes": _MAGIC_LINK_WINDOW_MINUTES},
        ).execute()
        attempts = int(count_resp.data or 0)
    except Exception as exc:
        _log.warning("Magic-link rate check failed for ip=%s: %s", ip, exc)
        attempts = 0

    if attempts >= _MAGIC_LINK_MAX_PER_WINDOW:
        _record_attempt(admin, email=email, ip=ip, ua=_safe_user_agent(user_agent), outcome="rate_limited")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "rate_limited",
                "message": "Too many sign-in attempts from this network. Try again in an hour.",
            },
            headers={"Retry-After": str(_MAGIC_LINK_WINDOW_MINUTES * 60)},
        )

    try:
        link = auth_links.mint_login_link(admin, email=email, redirect_to=body.redirect_to)
        if not email_service.send_email(
            to=email, subject="Sign in to Myro", text=_login_email_text(link)
        ):
            raise RuntimeError("email dispatch returned False")
    except Exception as exc:
        _log.warning("Magic-link send failed for %s: %s", email, exc)
        _record_attempt(admin, email=email, ip=ip, ua=_safe_user_agent(user_agent), outcome="failed")
        # Always return success-shaped response so attackers can't enumerate.
        return MagicLinkResponse(sent=True, message="If that email is reachable, a sign-in link is on its way.")

    _record_attempt(admin, email=email, ip=ip, ua=_safe_user_agent(user_agent), outcome="sent")
    return MagicLinkResponse(
        sent=True,
        message="Check your inbox — your sign-in link arrives in seconds.",
    )


def _login_email_text(link: str) -> str:
    return (
        "Sign in to Myro\n\n"
        "Tap the link below to sign in. It works once and expires shortly.\n\n"
        f"{link}\n\n"
        "Didn't request this? Ignore this email — no one can sign in without the link.\n\n"
        "— Myro"
    )


def _record_attempt(admin: Any, *, email: str, ip: str, ua: str | None, outcome: str) -> None:
    try:
        admin.table("magic_link_attempts").insert({
            "email": email,
            "ip": ip,
            "user_agent": ua,
            "outcome": outcome,
        }).execute()
    except Exception as exc:  # pragma: no cover — audit table is best-effort
        _log.warning("magic_link_attempts insert failed: %s", exc)


@router.delete("/integrations/{provider}", response_model=IntegrationRevokeResponse)
def revoke_integration(
    provider: str,
    principal: Principal = Depends(get_principal),
) -> IntegrationRevokeResponse:
    """v2 disconnect button. Removes the linked Supabase identity for the
    given provider while preserving the primary identity (email-password or
    other linked provider). Refuses to revoke if it would orphan the user.
    """
    provider_norm = provider.strip().lower()
    if provider_norm not in _SUPPORTED_REVOKE_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "unsupported_provider", "message": "Only google and linkedin_oidc can be revoked."},
        )

    admin = get_supabase_admin()
    try:
        identities_resp = admin.auth.admin.list_identities(principal.id)
        identities = getattr(identities_resp, "identities", None) or identities_resp or []
    except Exception as exc:
        _log.warning("list_identities failed for %s: %s", principal.id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "revoke_failed", "message": "Could not read your linked accounts. Try again."},
        )

    matching = [
        i for i in identities
        if (getattr(i, "provider", None) or (i.get("provider") if isinstance(i, dict) else None)) == provider_norm
    ]
    if not matching:
        return IntegrationRevokeResponse(
            provider=provider_norm,
            revoked=False,
            message="That account isn't connected.",
        )

    if len(identities) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "last_identity",
                "message": (
                    "This is your only sign-in method. Add another (email + password or another provider) "
                    "before disconnecting."
                ),
            },
        )

    identity_id = (
        getattr(matching[0], "identity_id", None)
        or (matching[0].get("identity_id") if isinstance(matching[0], dict) else None)
    )
    if not identity_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "revoke_failed", "message": "Identity ID missing. Try again."},
        )

    try:
        admin.auth.admin.delete_identity(identity_id)
    except Exception as exc:  # pragma: no cover — depends on SDK version
        _log.warning("delete_identity failed for %s/%s: %s", principal.id, identity_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "revoke_failed", "message": "Disconnect failed. Try again."},
        )

    # Clear LinkedIn metadata when LinkedIn is revoked so the next connect
    # starts clean (XP grant remains burned — one-time only by design).
    if provider_norm == "linkedin_oidc":
        try:
            admin.table("user_profiles").update(
                {"linkedin_url": None, "linkedin_headline": None, "linkedin_verified": False}
            ).eq("id", principal.id).execute()
        except Exception as exc:  # pragma: no cover
            _log.warning("LinkedIn metadata clear failed for %s: %s", principal.id, exc)

    return IntegrationRevokeResponse(
        provider=provider_norm,
        revoked=True,
        message="Disconnected.",
    )
