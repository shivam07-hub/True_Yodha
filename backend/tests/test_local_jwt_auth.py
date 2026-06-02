"""Local JWT verification in deps._decode_local_jwt.

Security-critical: a forged, expired, or wrong-audience token must be rejected
with 401. A valid token must yield the right identity without a network call.
"""

import time

import jwt
import pytest
from fastapi import HTTPException

from app import deps

_SECRET = "test-jwt-secret-do-not-use-in-prod"
_OTHER_SECRET = "a-different-secret"


def _make_token(secret: str = _SECRET, **overrides) -> str:
    now = int(time.time())
    claims = {
        "sub": "user-123",
        "email": "ninja@example.com",
        "aud": "authenticated",
        "exp": now + 3600,
        "iat": now,
        "user_metadata": {"full_name": "Test Ninja"},
    }
    claims.update(overrides)
    return jwt.encode(claims, secret, algorithm="HS256")


@pytest.fixture(autouse=True)
def _set_secret(monkeypatch):
    monkeypatch.setattr(deps.settings, "supabase_jwt_secret", _SECRET)


def test_valid_token_yields_identity():
    identity = deps._decode_local_jwt(_make_token())
    assert identity.id == "user-123"
    assert identity.email == "ninja@example.com"
    assert identity.full_name == "Test Ninja"


def test_expired_token_rejected():
    expired = _make_token(exp=int(time.time()) - 10)
    with pytest.raises(HTTPException) as exc:
        deps._decode_local_jwt(expired)
    assert exc.value.status_code == 401


def test_bad_signature_rejected():
    forged = _make_token(secret=_OTHER_SECRET)
    with pytest.raises(HTTPException) as exc:
        deps._decode_local_jwt(forged)
    assert exc.value.status_code == 401


def test_wrong_audience_rejected():
    wrong_aud = _make_token(aud="anon")
    with pytest.raises(HTTPException) as exc:
        deps._decode_local_jwt(wrong_aud)
    assert exc.value.status_code == 401


def test_missing_sub_rejected():
    # require=["sub"] makes PyJWT reject before our own None check.
    no_sub = _make_token()
    payload = jwt.decode(
        no_sub, _SECRET, algorithms=["HS256"], audience="authenticated"
    )
    payload.pop("sub")
    token = jwt.encode(payload, _SECRET, algorithm="HS256")
    with pytest.raises(HTTPException) as exc:
        deps._decode_local_jwt(token)
    assert exc.value.status_code == 401


def test_full_name_falls_back_to_name_key():
    token = _make_token(user_metadata={"name": "Fallback Name"})
    identity = deps._decode_local_jwt(token)
    assert identity.full_name == "Fallback Name"


def test_missing_metadata_is_tolerated():
    token = _make_token(user_metadata=None)
    identity = deps._decode_local_jwt(token)
    assert identity.full_name is None
    assert identity.id == "user-123"
