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
        self.on_list: list[dict[str, Any]] = []
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

    def listed(self, _uid: str) -> list[dict[str, Any]]:
        return self.on_list

    def new_worth(self, _uid: str, since: datetime) -> list[dict[str, Any]]:
        self.asked_since.append(since)
        return self.worth

    def offered(self, _uid: str) -> set[str]:
        # The same reading as the Supabase store: the job links in the sent bodies.
        return {m for row in self.rows.values() if row["state"] != "failed"
                for m in golden_digest._JOB_LINK.findall(row["body"])}

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
    store.on_list = [_job("tailored", match_score=90), _job("new-1", match_score=84)]

    report = send_due(NOW, store=store, mailer=mailer, apply=True, app_url=APP, api_url="https://api.himyro.com")

    assert report.sent == 1
    email = mailer.sent[0]
    assert email["subject"] == "Apply with the CV you tailored for PhonePe"
    text = email["text"]
    assert text.startswith("Hi Asha,")
    assert text.index("You tailored a CV for Product Designer at PhonePe") < text.index("Every job on your list")
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
    # A second run the same day, with something new to say, finds today's row claimed.
    store.worth = [_job("new-2")]
    assert send_due(NOW, store=store, mailer=mailer, apply=True, app_url=APP).skipped == {"claimed": 1}
    assert len(mailer.sent) == 1


def test_the_first_email_is_the_whole_list_and_later_ones_only_what_is_new() -> None:
    """Shivam, 2026-10-14: the first digest carries every job on their /market
    list, best first. After that, only what is new — and a card the drain re-read
    has a fresh timestamp but is not news if an earlier digest offered it."""
    store, mailer = _Store(), _Mailer()
    store.on_list = [_job(f"job-{n}", match_score=90 - n) for n in range(23)]
    send_due(NOW, store=store, mailer=mailer, apply=True, app_url=APP)
    first = mailer.sent[0]
    assert first["subject"] == "23 jobs worth applying to"
    assert "Every job on your list worth applying to, best first:" in first["text"]
    assert all(f"jobId=job-{n}&" in first["text"] for n in range(23))
    assert store.asked_since == []  # the first email does not ask what is new

    store.last = NOW
    store.worth = [_job("job-3", match_score=91), _job("fresh", match_score=80)]
    later = NOW + timedelta(days=3)
    send_due(later, store=store, mailer=mailer, apply=True, app_url=APP)
    second = mailer.sent[1]
    assert second["subject"] == "1 new job worth applying to"
    assert "jobId=fresh&" in second["text"] and "jobId=job-3&" not in second["text"]
    assert store.asked_since == [NOW]


def test_a_failed_send_is_recorded_and_not_counted_as_sent() -> None:
    store, mailer = _Store(), _Mailer(ok=False)
    store.on_list = [_job("new-1")]
    report = send_due(NOW, store=store, mailer=mailer, apply=True, app_url=APP)
    assert (report.sent, report.failed) == (0, 1)
    assert store.rows[1]["state"] == "failed"


def test_a_dry_run_writes_and_sends_nothing() -> None:
    store, mailer = _Store(), _Mailer()
    store.on_list = [_job("new-1")]
    report = send_due(NOW, store=store, mailer=mailer, apply=False, app_url=APP)
    assert mailer.sent == [] and store.rows == {}
    assert [subject for _, subject, _ in report.previews] == ["1 job worth applying to"]


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


def test_a_name_typed_in_capitals_is_not_shouted_back() -> None:
    digest = Digest(user_id="u1", unfinished=[], new=[golden_digest.Line("j", "Analyst", "Acme", "/cv?jobId=j")], first=True)
    assert golden_digest.render(digest, app_url=APP, name="RAJ KISHORE", unsubscribe_url=None).startswith("Hi Raj,")
    assert golden_digest.render(digest, app_url=APP, name="Asha Rao", unsubscribe_url=None).startswith("Hi Asha,")


# ── the production store reads the Yes, not the stage ──────────────────────


class _Rows:
    def __init__(self, rows: list[dict[str, Any]], filters: list[tuple[str, Any]]) -> None:
        self._rows = rows
        self._filters = filters

    def __getattr__(self, name: str) -> Any:
        if name == "not_":
            self._filters.append(("not", None))
            return self
        return lambda *a, **_k: (self._filters.append((name, a)), self)[1]

    def execute(self) -> Any:
        return type("R", (), {"data": self._rows})()


class _ProdDB:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self._tables = tables
        self.filters: dict[str, list[tuple[str, Any]]] = {}

    def table(self, name: str) -> _Rows:
        return _Rows(self._tables.get(name, []), self.filters.setdefault(name, []))


class _Jobs:
    def get_jobs_by_ids(self, job_ids: list[str]) -> list[dict[str, Any]]:
        return [{"job_id": j, "job_title": "Analyst", "company_name": "Acme",
                 "is_active": True, "listing_confidence": "active"} for j in job_ids]


def test_a_tailored_cv_with_a_yes_is_not_unfinished() -> None:
    """CONTEXT → Application Yes: "has it been sent?" reads applied_at. A Yes
    stays sent past interviewing; a withdrawn one (back to Saved) is unfinished."""
    db = _ProdDB({
        "cv_versions": [{"job_id": "sent"}, {"job_id": "open"}],
        # The query asks for applied_at set, so only the Yes comes back.
        "job_applications": [{"job_id": "sent"}],
    })
    store = golden_digest.SupabaseStore(db)
    store._jobs = _Jobs()

    assert [row["job_id"] for row in store.unfinished("u1")] == ["open"]
    assert ("is_", ("applied_at", "null")) in db.filters["job_applications"]
    assert ("not", None) in db.filters["job_applications"]
