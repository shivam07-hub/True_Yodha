from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""
    # Supabase project JWT secret (HS256). When set, access tokens are verified
    # LOCALLY in deps.get_current_user — no network round-trip to Supabase Auth
    # per request. Empty = fall back to the remote auth.get_user() path (ships
    # safe before the secret is provisioned). Find it in:
    # Supabase dashboard → Project Settings → API → JWT Settings → JWT Secret.
    supabase_jwt_secret: str = ""

    # ASYMMETRIC (ES256/RS256) access-token verification. Supabase projects on
    # JWT signing keys (ECC P-256 / RSA) sign tokens with a private key; we
    # verify locally against the project's PUBLIC keys (JWKS) — no secret, no
    # per-request round-trip. Empty = derived from supabase_url. Override only
    # for a non-standard auth host. See deps._asymmetric_signing_key.
    supabase_jwks_url: str = ""

    # Cloudflare Turnstile secret for the public, no-auth CV-score preview
    # endpoint (POST /public/score-cv). When set, the endpoint verifies the
    # client's Turnstile token server-side before spending any LLM budget.
    # Empty = verification SKIPPED (graceful: dev + pre-provision still work,
    # protected only by the per-IP rate limit). Set in prod to harden the
    # endpoint against bots farming the scoring chain. Cloudflare dashboard →
    # Turnstile → site → Secret Key.
    turnstile_secret: str = ""

    # Local LLM via LM Studio (priority 0 — no rate limits)
    lm_studio_tagger_model: str    = ""
    lm_studio_ranker_model: str    = ""
    lm_studio_extractor_model: str = ""
    lm_studio_base_url: str        = "http://localhost:1234/v1"

    # LLM keys — user-blocking fallback order: paid OpenRouter → Groq → Gemini.
    # Background/fail-soft work can still use the free-first provider.
    groq_api_key: str      = ""
    google_api_key: str    = ""
    openrouter_api_key: str = ""
    openai_api_key: str    = ""
    anthropic_api_key: str = ""

    # Email (post-MVP)
    sendgrid_api_key: str = ""
    resend_api_key: str = ""
    resend_from_email: str = "Myro <noreply@himyro.com>"
    newsletter_distribution_admin_token: str = ""

    # Myrology — booking requests are emailed to the in-house astrologer
    myrology_astrologer_email: str = ""

    # Institutions (B2B beta) — placement-cell applications are emailed here for
    # manual sales follow-up. Empty = persist-only (email send is skipped).
    institutions_lead_email: str = ""

    # Razorpay checkout
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    # Razorpay webhook secret (set when creating the webhook in the Razorpay
    # dashboard → Settings → Webhooks). Signs the raw request body; we verify it
    # in payments.razorpay_webhook. Empty = the webhook endpoint returns 503 so
    # the frontend verify-payment path stays the only fulfilment route (safe
    # before the webhook is provisioned). This closes the "paid but the browser
    # never called verify-payment" gap (tab closed / network drop after capture).
    razorpay_webhook_secret: str = ""

    # Myrology — token guarding the internal booking-status transition endpoint
    # (PATCH /myrology/bookings/{id}/status). Lets the astrologer/ops advance a
    # booking requested -> confirmed -> done. Empty = the endpoint returns 503.
    myrology_admin_token: str = ""

    # ₹99 Personalised Job-Switch Plan (#33). Review requests are emailed to the
    # founder/HITL reviewer here (empty = persist-only, email skipped). The admin
    # token guards the review-status transition endpoint (empty = endpoint 503).
    job_switch_reviewer_email: str = ""
    job_switch_admin_token: str = ""

    # Backlog #36 (event-driven matching) — token guarding the scrape-landed
    # webhook (POST /internal/scrape/landed). The scraper (firecrawl_Supabase)
    # fires this after it finishes writing a batch of new jobs, so the app sweeps
    # + notifies affected users immediately instead of polling. Empty = the
    # endpoint returns 503 (safe before the scraper is wired).
    scrape_webhook_token: str = ""

    # Environment
    railway_environment: str = "development"

    # Redis (durable async jobs)
    redis_url: str = ""
    job_compute_queue_name: str = "jobs_compute"
    job_compute_status_ttl_seconds: int = 24 * 3600
    job_compute_lock_ttl_seconds: int = 30 * 60

    # Provider Budget (ADR-0008) — global ceiling on concurrent LLM calls so a
    # load spike can never trip provider rate limits. Per-process asyncio cap
    # today (single web process is the only LLM caller); becomes a Redis token
    # bucket once Job Runners exist. Tune from measured 429 rate.
    llm_max_concurrency: int = 8
    # Rate-limit-aware retry inside LLMProvider.complete, per provider entry.
    llm_transient_retries: int = 2
    llm_retry_base_seconds: float = 1.0
    llm_retry_max_seconds: float = 20.0
    # Per-request HTTP timeout on every provider client. Without this the OpenAI
    # SDK default (600s + its own internal retries) lets ONE stalled provider
    # block a user-facing call for minutes before the fallback ladder can reach
    # the fast Groq lane (the 2m15s anon /score-cv incident). A slow-but-real
    # 4096-token extraction finishes well inside this; a genuine stall trips here
    # and falls through. SDK-level retries are disabled so the app loop owns them.
    llm_request_timeout_seconds: float = 45.0

    # CORS — comma-separated string, e.g.:
    # ALLOWED_ORIGINS=https://truemirror.vercel.app,http://localhost:3000
    allowed_origins: str = "*"

    # CV upload fallback + observability
    cv_upload_support_email: str = "support@himyro.com"
    cv_upload_fallback_form_url: str = ""
    cv_upload_alert_window_minutes: int = 15
    cv_upload_alert_min_samples: int = 25
    cv_upload_alert_failure_ratio: float = 0.25

    # Listing-verification belt. The sweep claims a batch every ~15 min, so two
    # hours of silence is several missed ticks — a stall, not a slow run.
    verifier_dead_man_hours: int = 2
    verifier_health_interval_minutes: int = 5

    @property
    def cors_origins(self) -> list[str]:
        if self.allowed_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def jwks_url(self) -> str:
        """JWKS endpoint for asymmetric token verification. Explicit override
        wins; otherwise derived from the Supabase project URL. Empty when no
        Supabase URL is configured (local verification then can't run for
        asymmetric tokens, and deps falls back to the remote path)."""
        if self.supabase_jwks_url:
            return self.supabase_jwks_url
        if self.supabase_url:
            return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        return ""


settings = Settings()
