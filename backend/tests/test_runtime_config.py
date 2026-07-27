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


def test_production_startup_never_requires_feature_scoped_turnstile_secret() -> None:
    config = Settings(
        _env_file=None,
        railway_environment="production",
        supabase_url="https://project.supabase.co",
        supabase_anon_key="anon-key",
        supabase_service_key="service-key",
        redis_url="redis://redis.internal:6379/0",
        turnstile_enabled=True,
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
        supabase_url="https://project.supabase.co",
        supabase_anon_key="anon-key",
        supabase_service_key="service-key",
    )

    assert config.release_tier == "dev"
    assert config.is_production is False
    config.validate_runtime_configuration()


def test_declared_environment_wins_over_railway_inference() -> None:
    # MYRO_ENV is the boundary; renaming a Railway service must not flip a tier.
    config = Settings(
        _env_file=None,
        myro_env="dev",
        railway_environment="production",
        railway_service_name="mirror-backend-prod",
    )

    assert config.release_tier == "dev"
    assert config.is_production is False


def test_unlabelled_railway_service_falls_back_to_production() -> None:
    # The worker and the verifier carry no MYRO_ENV yet and touch production
    # data, so the fail-safe direction is the strictest tier.
    config = Settings(
        _env_file=None,
        railway_environment="production",
        railway_service_name="True_Yodha",
    )

    assert config.release_tier == "prod"


def test_local_process_is_sandbox_and_skips_validation() -> None:
    config = Settings(_env_file=None)

    assert config.release_tier == "sandbox"
    # A laptop boots on a partial .env — nothing to page anybody about.
    config.validate_runtime_configuration()


def test_deployed_dev_refuses_to_boot_without_supabase() -> None:
    config = Settings(
        _env_file=None,
        railway_service_name="mirror-backend-dev",
        railway_environment="production",
        supabase_url="",
        supabase_anon_key="anon-key",
        supabase_service_key="service-key",
    )

    with pytest.raises(ValueError, match="dev configuration.*SUPABASE_URL"):
        config.validate_runtime_configuration()


def test_deployed_dev_refuses_to_boot_with_no_reachable_frontend_origin() -> None:
    # The 2026-07-27 outage in test form: dev booted "healthy" while answering
    # 400 to every preflight, because nothing asserted it could serve a browser.
    config = Settings(
        _env_file=None,
        railway_service_name="mirror-backend-dev",
        railway_environment="production",
        supabase_url="https://project.supabase.co",
        supabase_anon_key="anon-key",
        supabase_service_key="service-key",
        allowed_origins="",
        preview_origin_regex="",
    )

    with pytest.raises(ValueError, match="ALLOWED_ORIGINS or PREVIEW_ORIGIN_REGEX"):
        config.validate_runtime_configuration()


def test_dev_serves_preview_origins_and_production_never_does() -> None:
    dev = Settings(
        _env_file=None,
        railway_service_name="mirror-backend-dev",
        railway_environment="production",
    )
    prod = Settings(
        _env_file=None,
        railway_service_name="mirror-backend-prod",
        railway_environment="production",
    )

    assert dev.cors_origin_regex
    # Structural, not a config convention: production cannot pattern-match an
    # origin even if the variable is set on the service.
    assert prod.cors_origin_regex == ""


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
