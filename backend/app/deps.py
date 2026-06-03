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

_bearer = HTTPBearer()
_logger = logging.getLogger(__name__)

# Supabase access tokens are HS256, signed with the project JWT secret, with
# `aud="authenticated"`. Verifying locally (signature + exp + aud) replaces a
# network round-trip to Supabase Auth on EVERY request — the single biggest
# per-request latency win. See settings.supabase_jwt_secret.
_JWT_ALGORITHMS = ["HS256"]
_JWT_AUDIENCE = "authenticated"


class _LocalIdentity(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: str
    email: str | None = None
    full_name: str | None = None


def _decode_local_jwt(token: str) -> _LocalIdentity:
    """Verify a Supabase access token locally. Raises HTTP 401 on any invalid
    token (bad signature, expired, wrong audience, missing subject).

    Only called when `settings.supabase_jwt_secret` is set. When the secret is
    configured, local verification is authoritative — a rejection is a 401, we
    do NOT silently fall back to the remote path (that would mask a forged or
    expired token). Projects on asymmetric signing keys (ES256/RS256) must NOT
    set this HS256 secret; leave it empty to keep the remote path.
    """
    try:
        claims = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=_JWT_ALGORITHMS,
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
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> CurrentUser:
    token = credentials.credentials

    # Fast path: verify the JWT locally (no network) when the secret is set.
    if settings.supabase_jwt_secret:
        identity = _decode_local_jwt(token)  # raises 401 on any invalid token
        _ensure_profile_provisioned(identity.id, identity.email, identity.full_name)
        _ensure_location_country_backfilled(identity.id)
        return CurrentUser(id=identity.id, email=identity.email, token=token)

    # Fallback: remote validation via Supabase Auth (one network round-trip per
    # request). Used only until supabase_jwt_secret is provisioned.
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
