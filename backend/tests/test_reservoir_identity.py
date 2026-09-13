"""Foreign-document guard: candidate-name detection, verdicts, handler wiring."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import career_reservoir, reservoir_identity as ri

OWN_CV = """Shivam Pathak
IT Sales and Marketing
shivam.mit20@gmail.com · https://www.linkedin.com/in/spyog/

EXPERIENCE
GTM Business Development Manager · Capgemini GCC Growth
"""

FOREIGN_CV = """RISHABH GUHA
Senior Software Engineer
rishabh.guha91@example.com | +91 98xxxxxx

PROFESSIONAL SUMMARY
Seasoned engineer with 8 years of experience.
"""

NOTES_NO_CONTACT = """Random notes about a GTM pitch
Built the deck for the Siemens account, need to follow up.
"""


# ── candidate_names ──────────────────────────────────────────────────────────

def test_candidate_names_picks_header_name() -> None:
    assert "Shivam Pathak" in ri.candidate_names(OWN_CV)
    assert ri.candidate_names(FOREIGN_CV) == ["RISHABH GUHA"] or ri.candidate_names(FOREIGN_CV)[0].lower() == "rishabh guha"


def test_candidate_names_skips_headings_titles_orgs() -> None:
    text = "Professional Summary\nCareer Objective\nSenior Data Scientist\nGlobal Technologies Ltd\nSales Strategy\n"
    assert ri.candidate_names(text) == []


# ── classify ─────────────────────────────────────────────────────────────────

def test_own_by_email_wins_even_with_unknown_name() -> None:
    text = "Some Heading\nshivam.mit20@gmail.com\n"
    assert ri.classify(text, {"Someone Else"}, {"shivam.mit20@gmail.com"}) == "own"


def test_own_by_name_with_different_personal_email() -> None:
    # User's own OLD CV: same name, an email we've never seen — must ingest.
    old_cv = OWN_CV.replace("shivam.mit20@gmail.com", "shivam.old@yahoo.com")
    assert ri.classify(old_cv, {"Shivam Pathak"}, {"shivam.mit20@gmail.com"}) == "own"


def test_foreign_name_and_foreign_email() -> None:
    assert ri.classify(FOREIGN_CV, {"Shivam Pathak"}, {"shivam.mit20@gmail.com"}) == "foreign"


def test_unknown_when_no_known_identity() -> None:
    assert ri.classify(FOREIGN_CV, set(), set()) == "unknown"


def test_unknown_when_doc_has_no_email() -> None:
    # Confident-looking mismatching name but no email evidence → fail open.
    text = "Rishabh Guha\nSome intro line\n"
    assert ri.classify(text, {"Shivam Pathak"}, {"shivam.mit20@gmail.com"}) == "unknown"


def test_unknown_when_doc_has_no_name() -> None:
    assert ri.classify(NOTES_NO_CONTACT, {"Shivam Pathak"}, {"shivam.mit20@gmail.com"}) == "unknown"


# ── handler wiring ───────────────────────────────────────────────────────────

class _GuardRepo:
    def __init__(self, entry: dict[str, Any]):
        self.entry = entry
        self.skipped: list[tuple[str, dict | None, str]] = []
        self.processed: list[str] = []

    def get_entry(self, user_id: str, entry_id: str) -> dict[str, Any]:
        return self.entry

    def mark_skipped(self, user_id: str, entry_id: str, payload: dict | None, reason: str) -> None:
        self.skipped.append((entry_id, payload, reason))

    def mark_processed(self, user_id: str, entry_id: str, story_ids: list) -> None:
        self.processed.append(entry_id)


@pytest.mark.asyncio
async def test_ingest_skips_foreign_entry_without_extraction(monkeypatch: Any) -> None:
    entry = {"id": "e1", "text": FOREIGN_CV, "payload": {"filename": "rishabh.pdf"}}
    repo = _GuardRepo(entry)

    monkeypatch.setattr(
        "app.repositories.career_reservoir.CareerReservoirRepository", lambda db: repo
    )
    monkeypatch.setattr("app.database.get_supabase_admin", lambda: object())
    monkeypatch.setattr(ri, "known_identity", lambda user_id: ({"Shivam Pathak"}, {"shivam.mit20@gmail.com"}))

    async def _no_extract(*a: Any, **k: Any):  # extractor must never run
        raise AssertionError("extractor called for foreign doc")

    monkeypatch.setattr(career_reservoir.story_extractor, "extract", _no_extract)

    await career_reservoir._ingest_entry({"user_id": "u1", "entry_id": "e1"}, allow_retry=False)

    assert repo.skipped == [("e1", {"filename": "rishabh.pdf"}, "foreign_owner")]
    assert repo.processed == []


@pytest.mark.asyncio
async def test_the_users_own_uploaded_cv_is_never_judged_foreign(monkeypatch: Any) -> None:
    """The guard exists because a bulk DUMP can carry someone else's CV. An
    upload through the user's own account cannot, and judging it anyway is a
    silent data-loss path: at upload time the new baseline's `cv_structured` is
    still null, so the guard has only `user_profiles.full_name` to match on —
    one token mismatch plus any email in the document reads as foreign.
    """
    entry = {
        "id": "e2", "text": FOREIGN_CV, "payload": {"filename": "my-cv.pdf"},
        "source": career_reservoir.ONBOARDING_CV_SOURCE,
    }
    repo = _GuardRepo(entry)
    monkeypatch.setattr(
        "app.repositories.career_reservoir.CareerReservoirRepository", lambda db: repo
    )
    monkeypatch.setattr("app.database.get_supabase_admin", lambda: object())
    # A name that does NOT match the document — the guard would say "foreign".
    monkeypatch.setattr(ri, "known_identity", lambda user_id: ({"Shivam Pathak"}, set()))

    extracted: list[str] = []

    async def _extract(text: str, provider: Any):
        extracted.append(text)
        return {"roles": [], "stories": []}

    monkeypatch.setattr(career_reservoir.story_extractor, "extract", _extract)
    monkeypatch.setattr(career_reservoir, "get_paid_jobs_provider", lambda: object(), raising=False)

    async def _persist(*a: Any, **k: Any) -> list[str]:
        return []

    monkeypatch.setattr(career_reservoir, "_persist_extraction", _persist)

    await career_reservoir._ingest_entry({"user_id": "u1", "entry_id": "e2"}, allow_retry=False)

    assert repo.skipped == [], "an uploaded CV must never be skipped as foreign"
    assert extracted, "the extractor must read the user's own CV"
    assert repo.processed == ["e2"]


# ── the upload bridge ────────────────────────────────────────────────────────

from app.repositories.career_reservoir import INFLOW_KINDS  # noqa: E402

class _DumpRepo:
    def __init__(self, row: dict[str, Any] | None = None, boom: bool = False):
        self.row = row if row is not None else {"id": "entry-1"}
        self.boom = boom
        self.added: list[dict[str, Any]] = []

    def add(self, user_id: str, text: str, source: str = "manual", *, kind: str = "note",
            payload: dict | None = None) -> dict[str, Any]:
        if self.boom:
            raise RuntimeError("postgrest exploded")
        self.added.append(
            {"user_id": user_id, "text": text, "source": source, "kind": kind, "payload": payload}
        )
        return self.row


def _bridge(monkeypatch: Any, repo: _DumpRepo) -> list[tuple[str, str]]:
    enqueued: list[tuple[str, str]] = []
    monkeypatch.setattr("app.repositories.cv_dump.CvDumpRepository", lambda db: repo)
    monkeypatch.setattr("app.database.get_supabase_admin", lambda: object())
    monkeypatch.setattr(
        career_reservoir, "enqueue_ingest", lambda u, e: enqueued.append((u, e))
    )
    return enqueued


def test_banking_an_uploaded_cv_writes_an_inflow_the_extractor_reads(monkeypatch: Any) -> None:
    repo = _DumpRepo()
    enqueued = _bridge(monkeypatch, repo)

    entry_id = career_reservoir.bank_uploaded_cv("u1", "  Led the migration...  ", 42)

    assert entry_id == "entry-1"
    assert repo.added[0]["source"] == career_reservoir.ONBOARDING_CV_SOURCE
    # 'file', not 'note': note is the one kind nothing extracts (20260912130000).
    assert repo.added[0]["kind"] in INFLOW_KINDS
    assert repo.added[0]["text"] == "Led the migration..."
    assert repo.added[0]["payload"] == {"baseline_version_id": 42}
    assert enqueued == [("u1", "entry-1")]


def test_an_empty_cv_banks_nothing(monkeypatch: Any) -> None:
    repo = _DumpRepo()
    enqueued = _bridge(monkeypatch, repo)
    assert career_reservoir.bank_uploaded_cv("u1", "   ", 1) is None
    assert repo.added == [] and enqueued == []


def test_a_reservoir_failure_never_fails_the_upload(monkeypatch: Any) -> None:
    """The baseline is already persisted and the user is already done."""
    repo = _DumpRepo(boom=True)
    enqueued = _bridge(monkeypatch, repo)
    assert career_reservoir.bank_uploaded_cv("u1", "real text here", 1) is None
    assert enqueued == []


def test_a_write_that_returns_no_id_enqueues_nothing(monkeypatch: Any) -> None:
    repo = _DumpRepo(row={})
    enqueued = _bridge(monkeypatch, repo)
    assert career_reservoir.bank_uploaded_cv("u1", "real text here", 1) is None
    assert enqueued == []
