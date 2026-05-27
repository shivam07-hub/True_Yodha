from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""

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

    # Myrology — booking requests are emailed to the in-house astrologer
    myrology_astrologer_email: str = ""

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
