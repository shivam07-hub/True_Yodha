"""FastAPI auth seam.

Two dependencies, one validation path:

- `get_principal()` — typed identity. Use on any protected route. Returns
  `Principal(id, email)`. The `id` field is `auth.users.id` (UUID string,
  same field name as the Supabase SDK).
- `get_user_db()` — RLS-scoped Supabase client. Use in route signatures or
  repository factories that need to read/write through the caller's JWT.

Both deps memoize within a single request via FastAPI's dependency cache,
so the underlying JWT validation runs once per request even when both are
injected.

`CurrentUser` (Principal + token) and `get_current_user` remain for the
single internal seam where the bearer token needs to leave `deps.py`: the
`get_user_db` factory below. Routers should never depend on `CurrentUser`
directly — depend on `Principal` instead.
"""

import logging
import threading

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict
from supabase import Client

from app.config import settings
from app.database import get_supabase, get_supabase_admin, get_supabase_for_token
from app.db_safe import safe_profile_update, safe_read
from app.services.location_normalizer import derive_location_columns
from app.services.user_provisioning import ensure_user_provisioned

# auto_error=False so a MISSING Authorization header yields 401 (unauthenticated)
# below, not Starlette's default 403 (which means "authenticated but forbidden" —
# wrong for an absent credential). We raise the 401 explicitly in get_current_user.
_bearer = HTTPBearer(auto_error=False)
_logger = logging.getLogger(__name__)

# Supabase access tokens are verified LOCALLY (signature + exp + aud) to replace
# a network round-trip to Supabase Auth on EVERY request — the single biggest
# per-request latency win. Two signing schemes are supported, chosen per token
# from its header `alg`:
#   • Asymmetric (ES256/RS256…): projects on JWT signing keys sign with a
#     private key; we verify against the project's PUBLIC keys (JWKS). No secret.
#   • HS256: legacy shared-secret projects; verify with settings.supabase_jwt_secret.
# Anything we cannot verify locally (JWKS unreachable, unknown alg, HS256 with no
# secret) raises `_LocalVerifyUnavailable` and the caller falls back to the remote
# path — so local verification is a pure optimization that can never lock users
# out. A genuine signature/exp/aud failure (we held the key) is an authoritative 401.
_HS_ALGORITHMS = ["HS256"]
_ASYMMETRIC_ALGORITHMS = ["ES256", "ES384", "ES512", "RS256", "RS384", "RS512"]
_JWT_AUDIENCE = "authenticated"


class _LocalVerifyUnavailable(Exception):
    """Local verification could not be ATTEMPTED for this token (no key material
    on hand). Not an auth failure — the caller falls back to the remote path. A
    forged/expired token instead raises HTTPException(401)."""


class _LocalIdentity(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: str
    email: str | None = None
    full_name: str | None = None


_jwk_client: jwt.PyJWKClient | None = None
_jwk_client_lock = threading.Lock()


def _get_jwk_client() -> jwt.PyJWKClient:
    """Lazy singleton JWKS client. Caches the fetched key set in-memory and
    refetches on an unknown `kid` (key rotation), so steady state is network-free.
    Raises `_LocalVerifyUnavailable` when no JWKS URL is configured."""
    global _jwk_client
    if _jwk_client is None:
        with _jwk_client_lock:
            if _jwk_client is None:
                url = settings.jwks_url
                if not url:
                    raise _LocalVerifyUnavailable("no jwks_url configured")
                _jwk_client = jwt.PyJWKClient(url, cache_keys=True, lifespan=600)
    return _jwk_client


def _asymmetric_signing_key(token: str):
    """Resolve the public signing key for an asymmetric token from JWKS. Any
    failure (JWKS unreachable, unknown kid) degrades to the remote path rather
    than rejecting — remote Supabase Auth stays authoritative for such tokens."""
    client = _get_jwk_client()
    try:
        return client.get_signing_key_from_jwt(token).key
    except _LocalVerifyUnavailable:
        raise
    except Exception as exc:  # PyJWKClientError, urllib URLError, etc.
        _logger.warning("metric auth.jwks_unavailable reason=%s: %s", type(exc).__name__, exc)
        raise _LocalVerifyUnavailable(f"jwks key lookup failed: {exc}") from exc


def _decode_local_jwt(token: str) -> _LocalIdentity:
    """Verify a Supabase access token locally. Raises HTTP 401 on a token we
    could verify but found invalid (bad signature, expired, wrong audience,
    missing subject). Raises `_LocalVerifyUnavailable` when we lack the key
    material to verify it at all (caller then falls back to the remote path)."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from exc

    alg = header.get("alg", "")
    if alg in _ASYMMETRIC_ALGORITHMS:
        key = _asymmetric_signing_key(token)
        algorithms = [alg]
    elif alg in _HS_ALGORITHMS:
        if not settings.supabase_jwt_secret:
            raise _LocalVerifyUnavailable("HS256 token but no jwt secret configured")
        key = settings.supabase_jwt_secret
        algorithms = _HS_ALGORITHMS
    else:
        raise _LocalVerifyUnavailable(f"unsupported token alg {alg!r}")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience=_JWT_AUDIENCE,
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as exc:
        _logger.warning("Local JWT verification failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from exc

    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    metadata = claims.get("user_metadata") or {}
    full_name = None
    if isinstance(metadata, dict):
        full_name = metadata.get("full_name") or metadata.get("name")
    return _LocalIdentity(id=user_id, email=claims.get("email"), full_name=full_name)

_provisioned_users: set[str] = set()
_location_backfilled_users: set[str] = set()


class Principal(BaseModel):
    """Authenticated identity behind a request.

    Source: Supabase Auth JWT. `id` mirrors `auth.users.id` and matches the
    Supabase SDK's `response.user.id` — so there is one name for this value
    end-to-end (no `user_id` vs `id` mismatch to invite typos).
    """

    model_config = ConfigDict(frozen=True)
    id: str
    email: str | None = None


class CurrentUser(Principal):
    """Principal + bearer token. Internal — only `get_user_db` should read
    `.token`. Routers depend on `Principal`.
    """

    token: str


def _ensure_profile_provisioned(user_id: str, email: str | None, full_name: str | None) -> None:
    """Idempotent profile seed with ninja_name. Fails open."""
    if user_id in _provisioned_users or not email:
        return
    try:
        ensure_user_provisioned(user_id, email, full_name, myro_ref=None)
        _provisioned_users.add(user_id)
    except Exception as exc:
        _logger.warning("Auto-provision failed for user %s: %s: %s", user_id, type(exc).__name__, exc)


def _ensure_location_country_backfilled(user_id: str) -> None:
    if user_id in _location_backfilled_users:
        return
    try:
        admin = get_supabase_admin()
        data = safe_read(
            admin.table("user_profiles")
            .select("target_location, target_location_country, target_locations")
            .eq("id", user_id)
            .maybe_single(),
            default=None,
            context="location_country_backfill_read",
        ) or {}
        # Seed the canonical array (and its synced projections) for any legacy
        # row that still has only the scalar single set. Migration covers the
        # bulk; this is the per-request safety net so a profile read always has
        # target_locations populated. If the array column isn't migrated yet,
        # safe_read returns {} and safe_profile_update no-ops the new columns —
        # so we still mark the user done and never retry-storm the log.
        if data.get("target_location") and not data.get("target_locations"):
            safe_profile_update(
                admin.table("user_profiles"),
                derive_location_columns([data["target_location"]]),
                match_column="id",
                match_value=user_id,
                context="location_country_backfill_write",
            )
        _location_backfilled_users.add(user_id)
    except Exception as exc:
        _logger.warning(
            "Location country backfill failed for user %s: %s: %s",
            user_id,
            type(exc).__name__,
            exc,
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials

    # Fast path: verify the JWT locally (no network). Handles asymmetric
    # (ES256/RS256, via JWKS) and HS256 (via shared secret) tokens. A token we
    # can verify but find invalid raises 401 here (authoritative — no remote
    # masking of a forged/expired token). Only an inability to verify locally
    # (`_LocalVerifyUnavailable`) drops through to the remote path below.
    try:
        identity = _decode_local_jwt(token)
    except _LocalVerifyUnavailable as exc:
        _logger.info("metric auth.local_verify_unavailable reason=%s", exc)
    else:
        _ensure_profile_provisioned(identity.id, identity.email, identity.full_name)
        _ensure_location_country_backfilled(identity.id)
        return CurrentUser(id=identity.id, email=identity.email, token=token)

    # Fallback: remote validation via Supabase Auth (one network round-trip per
    # request). Used only when the token can't be verified locally.
    try:
        response = get_supabase().auth.get_user(token)
        if not response.user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        full_name: str | None = None
        metadata = response.user.user_metadata or {}
        if isinstance(metadata, dict):
            full_name = metadata.get("full_name") or metadata.get("name")
        _ensure_profile_provisioned(response.user.id, response.user.email, full_name)
        _ensure_location_country_backfilled(response.user.id)
        return CurrentUser(id=response.user.id, email=response.user.email, token=token)
    except HTTPException:
        raise
    except Exception as exc:
        _logger.warning("Token validation failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )


def get_principal(current_user: CurrentUser = Depends(get_current_user)) -> Principal:
    """Identity-only dep. Most routes should depend on this — not CurrentUser."""
    return Principal(id=current_user.id, email=current_user.email)


def get_user_db(current_user: CurrentUser = Depends(get_current_user)) -> Client:
    """RLS-scoped Supabase client bound to the caller's JWT. Only place
    `current_user.token` is read outside `deps.py`."""
    return get_supabase_for_token(current_user.token)
