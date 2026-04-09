from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""       # used in user-facing routes (respects RLS)
    supabase_service_key: str = ""    # used in admin/import scripts only (bypasses RLS)

    # Local LLM via LM Studio (priority 0 — no rate limits)
    lm_studio_tagger_model: str    = ""   # instruction model for skill tagging — e.g. qwen2.5-7b-instruct
    lm_studio_ranker_model: str    = ""   # reasoning model for job ranking — e.g. qwen3.5-9b-reasoning-distilled
    lm_studio_extractor_model: str = ""   # model for JD field extraction (defaults to tagger_model if empty)
    lm_studio_base_url: str        = "http://localhost:1234/v1"

    # LLM keys — fallback order: groq → gemini → openrouter
    # All three used in skill_tagger.py and diary_processor.py
    groq_api_key: str = ""
    google_api_key: str = ""        # Gemini 1.5 Flash — 1,500 req/day free
    openrouter_api_key: str = ""    # OpenRouter free models — no daily cap
    openai_api_key: str = ""        # GPT-4o mini — job re-ranking (Phase 1F)
    anthropic_api_key: str = ""

    # Email (post-MVP)
    sendgrid_api_key: str = ""

    # Environment
    railway_environment: str = "development"

    # CORS — comma-separated list of allowed origins
    allowed_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
