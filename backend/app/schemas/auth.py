from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None
    # Optional referrer slug. Cross-origin CORS prevents cookies from
    # auto-attaching, so the frontend echoes the captured ?ref= here.
    myro_ref: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    user_id: str
    email: EmailStr | None = None
    requires_email_confirmation: bool = False
    message: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


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
    # LinkedIn-only claim echoes (frontend mirrors them out of the OIDC ID
    # token because Supabase's JWT only ships standard OIDC fields; the
    # raw provider token is what carries `vanityName` / `headline`).
    linkedin_vanity: str | None = Field(default=None, max_length=120)
    linkedin_headline: str | None = Field(default=None, max_length=240)
    linkedin_verified: bool | None = None


class PostSigninResponse(BaseModel):
    user_id: str
    provider: str | None = None
    referral_attributed: bool = False
    linkedin_xp_granted: bool = False
    linkedin_url_set: bool = False


class IntegrationRevokeResponse(BaseModel):
    provider: str
    revoked: bool
    message: str
