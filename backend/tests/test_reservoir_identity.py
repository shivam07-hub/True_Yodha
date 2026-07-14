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
