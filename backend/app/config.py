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

    # Local LLM via LM Studio (priority 0 — no rate limits)
    lm_studio_tagger_model: str    = ""
    lm_studio_ranker_model: str    = ""
    lm_studio_extractor_model: str = ""
    lm_studio_base_url: str        = "http://localhost:1234/v1"

    # LLM keys — fallback order: groq → gemini → openrouter
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

    # CORS — comma-separated string, e.g.:
    # ALLOWED_ORIGINS=https://truemirror.vercel.app,http://localhost:3000
    allowed_origins: str = "*"

    # CV upload fallback + observability
    cv_upload_support_email: str = "support@himyro.com"
    cv_upload_fallback_form_url: str = ""
    cv_upload_alert_window_minutes: int = 15
    cv_upload_alert_min_samples: int = 25
    cv_upload_alert_failure_ratio: float = 0.25

    @property
    def cors_origins(self) -> list[str]:
        if self.allowed_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
