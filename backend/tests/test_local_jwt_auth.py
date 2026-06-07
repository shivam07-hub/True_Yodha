"""Local JWT verification in deps._decode_local_jwt.

Security-critical: a forged, expired, or wrong-audience token must be rejected
with 401. A valid token must yield the right identity without a network call.
"""

import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
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


# ── Asymmetric (ES256 / JWKS) verification ──────────────────────────────────
#
# Projects on JWT signing keys (ECC P-256) sign with a private key; deps verifies
# against the public key fetched from JWKS. We stub the JWKS client to return our
# test public key — the real network fetch is exercised in integration, not here.

_EC_PRIV = ec.generate_private_key(ec.SECP256R1())
_EC_PRIV_OTHER = ec.generate_private_key(ec.SECP256R1())


def _es256_token(signer: ec.EllipticCurvePrivateKey = _EC_PRIV, **overrides) -> str:
    now = int(time.time())
    claims = {
        "sub": "user-es-1",
        "email": "ec@example.com",
        "aud": "authenticated",
        "exp": now + 3600,
        "iat": now,
        "user_metadata": {"full_name": "EC Ninja"},
    }
    claims.update(overrides)
    pem = signer.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    return jwt.encode(claims, pem, algorithm="ES256", headers={"kid": "test-ec"})


class _FakeSigningKey:
    def __init__(self, key):
        self.key = key


class _FakeJWKClient:
    """Stands in for jwt.PyJWKClient — always resolves to a fixed public key."""

    def __init__(self, public_key):
        self._public_key = public_key

    def get_signing_key_from_jwt(self, _token):
        return _FakeSigningKey(self._public_key)


@pytest.fixture
def _jwks_returns_test_key(monkeypatch):
    monkeypatch.setattr(deps, "_get_jwk_client", lambda: _FakeJWKClient(_EC_PRIV.public_key()))


def test_es256_valid_token_yields_identity(_jwks_returns_test_key):
    identity = deps._decode_local_jwt(_es256_token())
    assert identity.id == "user-es-1"
    assert identity.email == "ec@example.com"
    assert identity.full_name == "EC Ninja"


def test_es256_expired_token_rejected(_jwks_returns_test_key):
    expired = _es256_token(exp=int(time.time()) - 10)
    with pytest.raises(HTTPException) as exc:
        deps._decode_local_jwt(expired)
    assert exc.value.status_code == 401


def test_es256_bad_signature_rejected(_jwks_returns_test_key):
    # Signed with a different EC key than JWKS hands back → signature mismatch.
    forged = _es256_token(signer=_EC_PRIV_OTHER)
    with pytest.raises(HTTPException) as exc:
        deps._decode_local_jwt(forged)
    assert exc.value.status_code == 401


def test_es256_jwks_unreachable_falls_back(monkeypatch):
    # JWKS infra failure must NOT 401 — it raises _LocalVerifyUnavailable so the
    # caller drops to the remote path (no outage on a transient JWKS hiccup).
    def _boom():
        raise deps._LocalVerifyUnavailable("jwks down")

    monkeypatch.setattr(deps, "_get_jwk_client", _boom)
    with pytest.raises(deps._LocalVerifyUnavailable):
        deps._decode_local_jwt(_es256_token())


def test_hs256_without_secret_is_unavailable(monkeypatch):
    # HS256 token but no shared secret configured → can't verify locally →
    # _LocalVerifyUnavailable (remote fallback), never a 401.
    monkeypatch.setattr(deps.settings, "supabase_jwt_secret", "")
    with pytest.raises(deps._LocalVerifyUnavailable):
        deps._decode_local_jwt(_make_token())


def test_unsupported_alg_is_unavailable():
    bad = jwt.encode({"sub": "x", "aud": "authenticated"}, "k", algorithm="HS512")
    with pytest.raises(deps._LocalVerifyUnavailable):
        deps._decode_local_jwt(bad)


def test_jwks_url_derived_from_supabase_url(monkeypatch):
    monkeypatch.setattr(deps.settings, "supabase_jwks_url", "")
    monkeypatch.setattr(deps.settings, "supabase_url", "https://abc.supabase.co")
    assert deps.settings.jwks_url == "https://abc.supabase.co/auth/v1/.well-known/jwks.json"
