"""`POST /jobs/import/extract-text`: a pasted job description into tracker fields."""
from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.routers.jobs import apply as router_mod
from app.services.llm_provider import LLMProviderError

TEXT = "Sales Manager at Swiggy, Bengaluru. Own the city's restaurant partner revenue."


class _Provider:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.seen: list[str] = []

    async def complete(self, messages, max_tokens=None, temperature=None):
        self.seen.append(messages[-1]["content"])
        if self.fail:
            raise LLMProviderError("down")
        return json.dumps({
            "company": "Swiggy", "role": "Sales Manager", "location": "Bengaluru",
            "job_description": "Own the city's restaurant partner revenue.",
        })


def _post(monkeypatch, provider: _Provider, text: str):
    monkeypatch.setattr(router_mod, "get_llm_provider", lambda: provider)
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", token="t")
    try:
        with TestClient(app) as client:
            return client.post("/jobs/import/extract-text", json={"text": text})
    finally:
        app.dependency_overrides.clear()


def test_pasted_text_comes_back_as_tracker_fields(monkeypatch) -> None:
    provider = _Provider()
    response = _post(monkeypatch, provider, TEXT)

    assert response.status_code == 200
    assert response.json()["role"] == "Sales Manager"
    assert response.json()["company"] == "Swiggy"
    assert provider.seen == [TEXT]


def test_too_little_text_is_not_sent_to_a_model(monkeypatch) -> None:
    provider = _Provider()
    response = _post(monkeypatch, provider, "Sales Manager")

    assert response.status_code == 422
    assert provider.seen == []


def test_a_busy_model_is_a_422_the_door_can_recover_from(monkeypatch) -> None:
    response = _post(monkeypatch, _Provider(fail=True), TEXT)

    assert response.status_code == 422
