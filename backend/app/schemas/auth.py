from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, SecretStr


class AcquisitionTouchRequest(BaseModel):
    source: str = Field(min_length=1, max_length=80)
    medium: str | None = Field(default=None, max_length=80)
    campaign: str | None = Field(default=None, max_length=160)
    content: str | None = Field(default=None, max_length=160)
    term: str | None = Field(default=None, max_length=160)
    landing_path: str = Field(min_length=1, max_length=500)
    captured_at: datetime


class AcquisitionAttributionRequest(BaseModel):
    first: AcquisitionTouchRequest
    latest: AcquisitionTouchRequest


class SignupRequest(BaseModel):
    email: EmailStr
    password: SecretStr
    full_name: str | None = None
    # Optional referrer slug. Cross-origin CORS prevents cookies from
    # auto-attaching, so the frontend echoes the captured ?ref= here.
    myro_ref: str | None = None
    attribution: AcquisitionAttributionRequest | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: SecretStr


class AuthResponse(BaseModel):
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    requires_email_confirmation: bool = False
    message: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: SecretStr


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class ExtensionSessionResponse(BaseModel):
    """POST /auth/extension-session — a fresh, INDEPENDENT Supabase session
    minted for the authenticated caller so the browser extension holds its own
    refresh-token family (never shares rotation with the web app session)."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_at: int | None = None


# ── ADR-0006 ─────────────────────────────────────────────────────────────

class MagicLinkRequest(BaseModel):
    """POST /auth/magic-link-request — wraps Supabase signInWithOtp."""
    email: EmailStr
    redirect_to: str | None = Field(default=None, max_length=512)


class MagicLinkResponse(BaseModel):
    sent: bool
    message: str
    retry_after_seconds: int | None = None


class PostSigninRequest(BaseModel):
    """POST /auth/post-signin.

    Frontend sends the freshly-issued provider after Supabase returns the
    session. Backend reads the JWT for the user identity and performs the
    provider-aware provisioning (SH7 ref attribution + LinkedIn metadata +
    one-time XP grants). Body carries the optional referrer because cross-
    origin CORS strips the cookie on the actual POST.
    """
    provider: str | None = None
    myro_ref: str | None = None
    attribution: AcquisitionAttributionRequest | None = None
    is_new_signup: bool = False
    # LinkedIn-only claim echoes (frontend mirrors them out of the OIDC ID
    # token because Supabase's JWT only ships standard OIDC fields; the
    # raw provider token is what carries `vanityName` / `headline`).
    linkedin_vanity: str | None = Field(default=None, max_length=120)
    linkedin_headline: str | None = Field(default=None, max_length=240)
    linkedin_verified: bool | None = None


class PostSigninResponse(BaseModel):
    provider: str | None = None
    referral_attributed: bool = False
    attribution_recorded: bool = False
    linkedin_xp_granted: bool = False
    linkedin_url_set: bool = False


class IntegrationRevokeResponse(BaseModel):
    provider: str
    revoked: bool
    message: str
