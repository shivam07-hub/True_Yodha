from fastapi.testclient import TestClient

from app.main import app
from app.services import ingestion_health, verifier_health


def test_health_check(monkeypatch) -> None:
    verifier_health.reset_cache()
    monkeypatch.setattr(
        verifier_health, "check_belt", lambda *a, **k: verifier_health.BeltHealth("ok", 0.3)
    )
    # Patched for the same reason the verifier is: unpatched it reads the real
    # `job_source_runs`, so a live ingestion outage would fail this test.
    ingestion_health.reset_cache()
    monkeypatch.setattr(
        ingestion_health,
        "check_ingestion",
        lambda *a, **k: ingestion_health.IngestionHealth("ok", 1.5),
    )

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "ingestion": "ok",
        "ingestion_stale_hours": 1.5,
        "verifier": "ok",
        "verifier_stale_hours": 0.3,
        "verifier_productive_stale_hours": None,
        "verifier_priority_backlog": None,
    }


def test_stalled_verifier_does_not_make_the_api_unhealthy(monkeypatch) -> None:
    """A quiet belt degrades listing freshness — it must never fail the platform
    health probe and trigger a restart or rollback of a perfectly healthy API."""
    verifier_health.reset_cache()
    monkeypatch.setattr(
        verifier_health, "check_belt", lambda *a, **k: verifier_health.BeltHealth("stalled", 96.0)
    )

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["verifier"] == "stalled"
