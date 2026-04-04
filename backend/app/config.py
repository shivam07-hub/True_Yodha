from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = ""

    # Supabase
    supabase_url: str = ""
    supabase_service_key: str = ""

    # OpenAI
    openai_api_key: str = ""

    # SendGrid
    sendgrid_api_key: str = ""

    # Environment
    railway_environment: str = "development"

    # CORS — comma-separated list of allowed origins
    allowed_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
