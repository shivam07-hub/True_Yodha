import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import re

from app.config import Settings
from app.main import app


def test_production_configuration_rejects_missing_critical_values() -> None:
    config = Settings(
        _env_file=None,
        railway_environment="production",
        supabase_url="",
        supabase_anon_key="anon-key",
        supabase_service_key="service-key",
        redis_url="redis://redis.internal:6379/0",
        turnstile_secret="turnstile-secret",
        allowed_origins="https://himyro.com",
        openrouter_api_key="provider-key",
        razorpay_key_id="rzp_live_public",
        razorpay_key_secret="razorpay-secret",
        razorpay_webhook_secret="webhook-secret",
    )

    with pytest.raises(ValueError, match="SUPABASE_URL"):
        config.validate_runtime_configuration()


def test_production_configuration_rejects_wildcard_cors() -> None:
    config = Settings(
        _env_file=None,
        railway_environment="production",
        supabase_url="https://project.supabase.co",
        supabase_anon_key="anon-key",
        supabase_service_key="service-key",
        redis_url="redis://redis.internal:6379/0",
        turnstile_secret="turnstile-secret",
        allowed_origins="*",
        openrouter_api_key="provider-key",
        razorpay_key_id="rzp_live_public",
        razorpay_key_secret="razorpay-secret",
        razorpay_webhook_secret="webhook-secret",
    )

    with pytest.raises(ValueError, match="ALLOWED_ORIGINS"):
        config.validate_runtime_configuration()


def test_production_configuration_rejects_insecure_cors_origins() -> None:
    config = Settings(
        _env_file=None,
        railway_environment="production",
        supabase_url="https://project.supabase.co",
        supabase_anon_key="anon-key",
        supabase_service_key="service-key",
        redis_url="redis://redis.internal:6379/0",
        turnstile_secret="turnstile-secret",
        allowed_origins="http://himyro.com",
        openrouter_api_key="provider-key",
        razorpay_key_id="rzp_live_public",
        razorpay_key_secret="razorpay-secret",
        razorpay_webhook_secret="webhook-secret",
    )

    with pytest.raises(ValueError, match="ALLOWED_ORIGINS.*HTTPS"):
        config.validate_runtime_configuration()


def test_production_configuration_rejects_debug_mode() -> None:
    config = Settings(
        _env_file=None,
        railway_environment="production",
        debug=True,
        supabase_url="https://project.supabase.co",
        supabase_anon_key="anon-key",
        supabase_service_key="service-key",
        redis_url="redis://redis.internal:6379/0",
        turnstile_secret="turnstile-secret",
        allowed_origins="https://himyro.com",
        openrouter_api_key="provider-key",
        razorpay_key_id="rzp_live_public",
        razorpay_key_secret="razorpay-secret",
        razorpay_webhook_secret="webhook-secret",
    )

    with pytest.raises(ValueError, match="DEBUG"):
        config.validate_runtime_configuration()


def test_production_configuration_rejects_insecure_supabase_transport() -> None:
    config = Settings(
        _env_file=None,
        railway_environment="production",
        supabase_url="http://project.supabase.co",
        supabase_anon_key="anon-key",
        supabase_service_key="service-key",
        redis_url="redis://redis.internal:6379/0",
        turnstile_secret="turnstile-secret",
        allowed_origins="https://himyro.com",
        openrouter_api_key="provider-key",
        razorpay_key_id="rzp_live_public",
        razorpay_key_secret="razorpay-secret",
        razorpay_webhook_secret="webhook-secret",
    )

    with pytest.raises(ValueError, match="SUPABASE_URL.*HTTPS"):
        config.validate_runtime_configuration()


def test_production_configuration_rejects_example_placeholders() -> None:
    config = Settings(
        _env_file=None,
        railway_environment="production",
        supabase_url="https://project.supabase.co",
        supabase_anon_key="anon-key",
        supabase_service_key="your-supabase-service-role-key",
        redis_url="redis://redis.internal:6379/0",
        turnstile_secret="turnstile-secret",
        allowed_origins="https://himyro.com",
        openrouter_api_key="provider-key",
        razorpay_key_id="rzp_live_public",
        razorpay_key_secret="razorpay-secret",
        razorpay_webhook_secret="webhook-secret",
    )

    with pytest.raises(ValueError, match="SUPABASE_SERVICE_KEY.*placeholder"):
        config.validate_runtime_configuration()


def test_production_configuration_rejects_placeholder_provider_key() -> None:
    config = Settings(
        _env_file=None,
        railway_environment="production",
        supabase_url="https://project.supabase.co",
        supabase_anon_key="anon-key",
        supabase_service_key="service-key",
        redis_url="redis://redis.internal:6379/0",
        turnstile_secret="turnstile-secret",
        allowed_origins="https://himyro.com",
        openrouter_api_key="your-openrouter-api-key",
        razorpay_key_id="rzp_live_public",
        razorpay_key_secret="razorpay-secret",
        razorpay_webhook_secret="webhook-secret",
    )

    with pytest.raises(ValueError, match="provider.*placeholder"):
        config.validate_runtime_configuration()


def test_valid_production_configuration_passes() -> None:
    config = Settings(
        _env_file=None,
        railway_environment="production",
        supabase_url="https://project.supabase.co",
        supabase_anon_key="anon-key",
        supabase_service_key="service-key",
        redis_url="redis://redis.internal:6379/0",
        turnstile_secret="turnstile-secret",
        allowed_origins="https://himyro.com,https://www.himyro.com",
        openrouter_api_key="provider-key",
        razorpay_key_id="rzp_live_public",
        razorpay_key_secret="razorpay-secret",
        razorpay_webhook_secret="webhook-secret",
    )

    config.validate_runtime_configuration()


def test_production_startup_allows_missing_feature_scoped_turnstile_secret() -> None:
    config = Settings(
        _env_file=None,
        railway_environment="production",
        supabase_url="https://project.supabase.co",
        supabase_anon_key="anon-key",
        supabase_service_key="service-key",
        redis_url="redis://redis.internal:6379/0",
        turnstile_secret="",
        allowed_origins="https://himyro.com,https://www.himyro.com",
        openrouter_api_key="provider-key",
        razorpay_key_id="rzp_live_public",
        razorpay_key_secret="razorpay-secret",
        razorpay_webhook_secret="webhook-secret",
    )

    config.validate_runtime_configuration()


def test_api_refuses_to_start_with_invalid_production_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "railway_environment", "production")
    monkeypatch.setattr(settings, "supabase_url", "")

    with pytest.raises(ValueError, match="SUPABASE_URL"):
        with TestClient(app):
            pass


def test_development_defaults_are_safe() -> None:
    config = Settings(_env_file=None, railway_environment="development")

    assert config.debug is False
    assert config.cors_origins == ["http://localhost:3000"]


def test_develop_backend_service_is_not_classified_as_production() -> None:
    config = Settings(
        _env_file=None,
        railway_environment="production",
        railway_service_name="mirror-backend-dev",
    )

    assert config.is_production is False
    config.validate_runtime_configuration()


def test_production_backend_service_always_enforces_production_rules() -> None:
    config = Settings(
        _env_file=None,
        railway_environment="development",
        railway_service_name="mirror-backend-prod",
    )

    assert config.is_production is True
    with pytest.raises(ValueError, match="SUPABASE_URL"):
        config.validate_runtime_configuration()


def test_backend_env_example_documents_every_setting() -> None:
    example_path = Path(__file__).resolve().parents[1] / ".env.example"
    documented = {
        line.split("=", 1)[0]
        for line in example_path.read_text().splitlines()
        if line and not line.startswith("#") and "=" in line
    }
    expected = {name.upper() for name in Settings.model_fields}

    assert expected <= documented


def test_backend_env_example_documents_direct_environment_reads() -> None:
    backend_root = Path(__file__).resolve().parents[1]
    example_path = backend_root / ".env.example"
    documented = {
        line.split("=", 1)[0]
        for line in example_path.read_text().splitlines()
        if line and not line.startswith("#") and "=" in line
    }
    referenced: set[str] = set()
    pattern = re.compile(
        r"""(?:os\.getenv|os\.environ\.get)\(\s*["']([A-Z][A-Z0-9_]+)["']"""
    )
    sources = [
        *backend_root.joinpath("app").rglob("*.py"),
        *backend_root.joinpath("scripts").rglob("*.py"),
    ]
    for source in sources:
        referenced.update(pattern.findall(source.read_text()))

    assert referenced <= documented
