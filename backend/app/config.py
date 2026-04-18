from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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

    # Environment
    railway_environment: str = "development"

    # CORS — comma-separated string, e.g.:
    # ALLOWED_ORIGINS=https://truemirror.vercel.app,http://localhost:3000
    allowed_origins: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
