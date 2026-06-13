"""Authenticated production smoke test for the upskilling ladder."""

from __future__ import annotations

import os
import time
from typing import Any

import httpx


class SmokeFailure(RuntimeError):
    """The deployed upskilling contract is not healthy."""


def choose_startable_skill(skills: list[dict[str, Any]]) -> tuple[dict[str, Any], int]:
    for skill in skills:
        cleared = int(skill.get("cleared_level") or 0)
        next_level = int(skill.get("next_level") or min(cleared + 1, 5))
        max_bank_level = int(skill.get("max_bank_level") or 0)
        if not skill.get("locked") and cleared < 5 and max_bank_level >= next_level:
            return skill, next_level
    raise SmokeFailure("No startable skill was returned by the ladder.")


def validate_start_response(payload: dict[str, Any]) -> None:
    if not payload.get("set_id"):
        raise SmokeFailure("Started set did not include a set_id.")

    questions = payload.get("questions")
    if not isinstance(questions, list) or len(questions) != 10:
        raise SmokeFailure("Started set must contain exactly 10 questions.")

    question_ids: set[int] = set()
    for question in questions:
        if "correct_index" in question:
            raise SmokeFailure("Served question exposed the answer key.")
        if not question.get("question_text"):
            raise SmokeFailure("Served question is missing question_text.")
        if not isinstance(question.get("options"), list) or len(question["options"]) != 4:
            raise SmokeFailure("Served question must contain exactly four options.")
        question_ids.add(int(question["id"]))

    if len(question_ids) != 10:
        raise SmokeFailure("Started set contains duplicate question IDs.")


def _response_json(response: httpx.Response, label: str) -> Any:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        body = response.text[:500]
        raise SmokeFailure(f"{label} failed with HTTP {response.status_code}: {body}") from exc
    try:
        return response.json()
    except ValueError as exc:
        raise SmokeFailure(f"{label} returned invalid JSON.") from exc


def wait_for_backend(
    client: httpx.Client,
    expected_version: str | None,
    timeout_seconds: int = 900,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    last_status: dict[str, Any] | None = None

    while time.monotonic() < deadline:
        try:
            response = client.get("/v1/status")
            if response.is_success:
                status = response.json()
                last_status = status
                version_matches = not expected_version or status.get("version") == expected_version
                if status.get("status") == "ready" and version_matches:
                    return status
        except (httpx.HTTPError, ValueError):
            pass
        time.sleep(10)

    raise SmokeFailure(
        f"Backend did not become ready at version {expected_version!r}; "
        f"last status was {last_status!r}."
    )


def run() -> None:
    base_url = os.getenv("MYRO_API_BASE_URL", "https://api.himyro.com").rstrip("/")
    email = os.getenv("MYRO_SMOKE_EMAIL")
    password = os.getenv("MYRO_SMOKE_PASSWORD")
    expected_version = os.getenv("MYRO_EXPECTED_VERSION") or None

    if not email or not password:
        raise SmokeFailure("MYRO_SMOKE_EMAIL and MYRO_SMOKE_PASSWORD are required.")

    with httpx.Client(base_url=base_url, timeout=30.0) as client:
        status = wait_for_backend(client, expected_version)
        auth = _response_json(
            client.post("/auth/login", json={"email": email, "password": password}),
            "Login",
        )
        token = auth.get("access_token")
        if not token:
            raise SmokeFailure("Login response did not include an access token.")

        headers = {"Authorization": f"Bearer {token}"}
        skills = _response_json(
            client.get("/upskilling/skills", headers=headers),
            "Ladder load",
        )
        if not isinstance(skills, list) or not skills:
            raise SmokeFailure("Ladder returned no practiceable skills.")

        skill, level = choose_startable_skill(skills)
        started = _response_json(
            client.post(
                "/upskilling/sets",
                headers=headers,
                json={"skill_id": skill["skill_id"], "level": level},
            ),
            "Set start",
        )
        validate_start_response(started)

    print(
        "Upskilling smoke passed: "
        f"version={status.get('version')} "
        f"skill={skill.get('display_name')} level={level} questions=10"
    )


if __name__ == "__main__":
    run()
