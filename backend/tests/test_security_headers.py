from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.security.headers import install_security_headers


def test_security_headers_are_present_on_every_response() -> None:
    test_app = FastAPI()
    install_security_headers(test_app)

    @test_app.get("/ok")
    def ok() -> dict[str, bool]:
        return {"ok": True}

    with TestClient(test_app) as client:
        success = client.get("/ok")
        missing = client.get("/missing")

    for response in (success, missing):
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["strict-transport-security"] == (
            "max-age=31536000; includeSubDomains"
        )
        assert "script-src 'self'" in response.headers["content-security-policy"]
