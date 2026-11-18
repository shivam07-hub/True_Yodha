"""The review and go-live emails name what was posted: a job or an internship."""

from __future__ import annotations

import pytest

from app.services import hosted_review_mail as mail

JOB = {
    "job_id": "myro_1",
    "job_title": "Area sales manager",
    "company_name": "Campus Co",
    "employment_kind": "full_time",
    "stipend_low_inr": None,
    "duration_months": None,
    "location": "Jaipur",
    "job_description": "Own a territory and a number, reported monthly.",
    "poster_id": "u1",
}
INTERN = {
    **JOB,
    "job_title": "Product intern",
    "employment_kind": "internship",
    "stipend_low_inr": 8000,
    "duration_months": 3,
}


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    out: list[dict] = []
    monkeypatch.setattr(mail, "send_email", lambda **kw: out.append(kw) or True)
    monkeypatch.setattr(mail, "poster_email", lambda _db, _pid: "poster@example.com")
    return out


def test_a_job_reaches_the_reviewer_as_a_job(sent: list[dict]) -> None:
    mail.alert_reviewer(JOB)
    assert sent[0]["subject"] == "Job to check: Area sales manager at Campus Co"
    assert "Stipend" not in sent[0]["text"]
    assert "Jaipur" in sent[0]["text"]


def test_an_internship_still_shows_its_stipend(sent: list[dict]) -> None:
    mail.alert_reviewer(INTERN)
    assert sent[0]["subject"] == "Internship to check: Product intern at Campus Co"
    assert "Stipend: INR 8000/month · 3 months" in sent[0]["text"]


def test_the_poster_hears_what_seekers_send(sent: list[dict]) -> None:
    mail.tell_poster_live(object(), JOB)
    assert sent[0]["subject"] == "Your job is live: Area sales manager at Campus Co"
    assert "Myro Supported" in sent[0]["text"]
    assert "a CV written for this opening" in sent[0]["text"]
    assert "already have" not in sent[0]["text"]
