"""The golden-list digest (#55 S4 / #59): what it says, when, and to whom —
end to end on in-memory seams, no network."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.services import golden_digest
from app.services.golden_digest import Digest, send_due

NOW = datetime(2026, 10, 14, 3, 30, tzinfo=timezone.utc)
APP = "https://himyro.com"


class _Store:
    def __init__(self) -> None:
        self.member = {"user_id": "u1", "email": "a@example.com", "full_name": "Asha Rao",
                       "golden_list_since": "2026-10-07T00:00:00+00:00"}
        self.last: datetime | None = None
        self.open_cvs: list[dict[str, Any]] = []
        self.worth: list[dict[str, Any]] = []
        self.rows: dict[int, dict[str, Any]] = {}
        self.days: set[str] = set()
        self.asked_since: list[datetime] = []

    def members(self) -> list[dict[str, Any]]:
        return [self.member]

    def last_sent_at(self, _uid: str) -> datetime | None:
        return self.last

    def unfinished(self, _uid: str) -> list[dict[str, Any]]:
        return self.open_cvs

    def new_worth(self, _uid: str, since: datetime) -> list[dict[str, Any]]:
        self.asked_since.append(since)
        return self.worth

    def claim(self, user_id: str, day: str, digest: Digest, text: str) -> int | None:
        if (user_id, day) in self.days:
            return None
        self.days.add((user_id, day))
        row_id = len(self.rows) + 1
        self.rows[row_id] = {"state": "processing", "action_url": digest.lead.path, "body": text}
        return row_id

    def mark(self, row_id: int, state: str) -> None:
        self.rows[row_id]["state"] = state


class _Mailer:
    def __init__(self, ok: bool = True) -> None:
        self.ok = ok
        self.sent: list[dict[str, Any]] = []

    def send(self, *, to: str, subject: str, text: str, headers: dict[str, str]) -> bool:
        self.sent.append({"to": to, "subject": subject, "text": text, "headers": headers})
        return self.ok


@pytest.fixture(autouse=True)
def _secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MYRO_ANALYTICS_REFRESH_SECRET", "test-refresh-secret-value")


def _job(job_id: str, **over: Any) -> dict[str, Any]:
    return {"job_id": job_id, "job_title": "Analyst", "company_name": "Acme", **over}


def test_a_tailored_cv_not_yet_sent_leads_the_email() -> None:
    store, mailer = _Store(), _Mailer()
    store.open_cvs = [_job("tailored", company_name="PhonePe", job_title="Product Designer")]
    store.worth = [_job("new-1", match_score=84), _job("tailored", match_score=90)]

    report = send_due(NOW, store=store, mailer=mailer, apply=True, app_url=APP, api_url="https://api.himyro.com")

    assert report.sent == 1
    email = mailer.sent[0]
    assert email["subject"] == "Apply with the CV you tailored for PhonePe"
    text = email["text"]
    assert text.startswith("Hi Asha,")
    assert text.index("You tailored a CV for Product Designer at PhonePe") < text.index("New jobs worth applying to")
    assert f"{APP}/collections?jobId=tailored&utm_source=golden_digest" in text
    assert f"{APP}/cv?jobId=new-1&utm_source=golden_digest" in text
    assert text.count("jobId=tailored") == 1  # not offered twice
    assert "84% fit" in text
    token = golden_digest.unsubscribe_token("u1")
    assert f"Stop these emails: {APP}/unsubscribe?t={token}" in text
    assert email["headers"] == {
        "List-Unsubscribe": f"<https://api.himyro.com/email/unsubscribe?t={token}>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }
    assert store.rows[1]["state"] == "ready"
    assert store.rows[1]["action_url"] == "/collections?jobId=tailored"


def test_nothing_to_say_sends_nothing() -> None:
    store, mailer = _Store(), _Mailer()
    report = send_due(NOW, store=store, mailer=mailer, apply=True, app_url=APP)
    assert mailer.sent == [] and store.rows == {}
    assert report.skipped == {"nothing_to_say": 1}


def test_never_twice_in_three_days_and_never_twice_a_day() -> None:
    store, mailer = _Store(), _Mailer()
    store.worth = [_job("new-1")]
    store.last = NOW - timedelta(days=2, hours=23)
    assert send_due(NOW, store=store, mailer=mailer, apply=True, app_url=APP).skipped == {"cadence": 1}

    store.last = NOW - timedelta(days=3)
    assert send_due(NOW, store=store, mailer=mailer, apply=True, app_url=APP).sent == 1
    # The new-jobs window opens at the last digest, not at joining the list.
    assert store.asked_since[-1] == NOW - timedelta(days=3)
    # A second run the same day finds today's row claimed.
    assert send_due(NOW, store=store, mailer=mailer, apply=True, app_url=APP).skipped == {"claimed": 1}
    assert len(mailer.sent) == 1


def test_a_first_digest_reads_new_jobs_since_joining_the_list() -> None:
    store = _Store()
    store.worth = [_job("new-1")]
    send_due(NOW, store=store, mailer=_Mailer(), apply=True, app_url=APP)
    assert store.asked_since == [datetime(2026, 10, 7, tzinfo=timezone.utc)]


def test_a_failed_send_is_recorded_and_not_counted_as_sent() -> None:
    store, mailer = _Store(), _Mailer(ok=False)
    store.worth = [_job("new-1")]
    report = send_due(NOW, store=store, mailer=mailer, apply=True, app_url=APP)
    assert (report.sent, report.failed) == (0, 1)
    assert store.rows[1]["state"] == "failed"


def test_a_dry_run_writes_and_sends_nothing() -> None:
    store, mailer = _Store(), _Mailer()
    store.worth = [_job("new-1")]
    report = send_due(NOW, store=store, mailer=mailer, apply=False, app_url=APP)
    assert mailer.sent == [] and store.rows == {}
    assert [subject for _, subject, _ in report.previews] == ["1 new job worth applying to"]


def test_a_preview_goes_only_to_the_operator_and_ignores_cadence() -> None:
    store, mailer = _Store(), _Mailer()
    store.worth = [_job("new-1")]
    store.last = NOW - timedelta(hours=1)
    send_due(NOW, store=store, mailer=mailer, apply=True, app_url=APP, preview_to="ops@example.com")
    assert [(m["to"], m["subject"]) for m in mailer.sent] == [("ops@example.com", "[preview] 1 new job worth applying to")]
    assert store.rows == {}


def test_a_token_names_one_person_and_cannot_be_forged() -> None:
    token = golden_digest.unsubscribe_token("u1")
    assert golden_digest.user_for_token(token) == "u1"
    assert golden_digest.user_for_token(token.replace("u1.", "u2.")) is None
    assert golden_digest.user_for_token("u1.not-the-mac") is None


def test_no_secret_mints_no_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MYRO_ANALYTICS_REFRESH_SECRET")
    assert golden_digest.unsubscribe_token("u1") is None
    assert golden_digest.user_for_token("u1.anything") is None


def test_the_unsubscribe_link_takes_one_post_and_no_login(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.main import app
    from app.routers import email_prefs

    updates: list[tuple[dict[str, Any], list[tuple[str, Any]]]] = []

    class _Q:
        def __init__(self, payload: dict[str, Any]) -> None:
            self.payload, self.filters = payload, []

        def eq(self, key: str, value: Any) -> "_Q":
            self.filters.append((key, value))
            return self

        def is_(self, key: str, value: Any) -> "_Q":
            self.filters.append((key, value))
            return self

        def execute(self) -> None:
            updates.append((self.payload, self.filters))

    class _DB:
        def table(self, _name: str) -> Any:
            return type("T", (), {"update": lambda _self, payload: _Q(payload)})()

    monkeypatch.setattr(email_prefs, "get_supabase_admin", lambda: _DB())
    client = TestClient(app)
    token = golden_digest.unsubscribe_token("u1")
    assert client.get(f"/email/unsubscribe?t={token}").status_code == 405  # a scanner's GET does nothing
    assert client.post(f"/email/unsubscribe?t={token}", data={"List-Unsubscribe": "One-Click"}).status_code == 204
    assert updates[0][1] == [("id", "u1"), ("digest_unsubscribed_at", "null")]
    assert client.post("/email/unsubscribe?t=u1.forged-mac-value").status_code == 400
    assert len(updates) == 1


def test_the_send_route_needs_the_secret_and_production() -> None:
    from app.main import app
    from app.routers import internal

    assert not internal.settings.is_production
    client = TestClient(app)
    assert client.post("/internal/golden-digest/send", json={}, headers={"X-Myro-Refresh-Secret": "wrong-secret-xx"}).status_code == 403
    response = client.post("/internal/golden-digest/send", json={},
                           headers={"X-Myro-Refresh-Secret": "test-refresh-secret-value"})
    assert response.status_code == 409
