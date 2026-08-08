"""The CV read seam may never fail on the SHAPE of a stored row.

Reading back your own CV is the product. A user who cannot open or download the
CV they uploaded has nothing, and that is precisely what happened between
2026-04-18 and 2026-08-08 for six users: `get_or_backfill_cv_structured` gated on
`if structured:` — truthiness, not shape — so a row holding `{"contact": {...}}`
skipped the rebuild and went straight into a 7-field response model. 500 on every
load, with a parseable `body_text` sitting in the same row.

These tests pin the four outcomes the seam is allowed to have. Partner-sourced
onboarding (Finlatics) lands users on this path with no support channel, so a
regression here is silent until someone complains.
"""

import pytest
from fastapi import HTTPException

from app.repositories.cv import CVVersionsRepository
from app.routers.cv.structured import CVStructuredResponse
from app.services import cv_workflow
from app.services.cv_structured_shape import CONTRACT_KEYS, has_content


class _FakeRepo:
    """Stands in for CVVersionsRepository — only the two methods the seam calls."""

    def __init__(self, baseline: dict | None) -> None:
        self._baseline = baseline
        self.written: dict | None = None

    def latest_baseline(self, user_id: str) -> dict | None:
        return self._baseline

    def update_structured(self, version_id: int, cv_structured: dict) -> None:
        self.written = cv_structured


_FULL = {
    "contact": {"name": "Ada Lovelace", "title": "", "email": "", "phone": "", "location": "", "linkedin": ""},
    "summary": "Engineer.",
    "education": [],
    "experience": [{"company": "Analytical", "role": "Engineer", "dates": "1843", "location": "", "bullets": ["Wrote the first program."]}],
    "projects": [],
    "skills_line": "Mathematics",
    "certs": [],
}


@pytest.fixture
def no_llm(monkeypatch):
    """Default: the provider is never reached. Tests that need it opt in."""
    async def _boom(_raw_text: str):
        raise AssertionError("rebuild should not have run")

    monkeypatch.setattr(cv_workflow.cv_parser, "reparse_structured_only", _boom)


@pytest.mark.asyncio
async def test_healthy_row_is_returned_untouched(no_llm) -> None:
    repo = _FakeRepo({"id": 1, "cv_structured": _FULL, "body_text": "irrelevant"})

    payload = await cv_workflow.get_or_backfill_cv_structured(repo, "u1")

    assert CVStructuredResponse(**payload).summary == "Engineer."
    assert repo.written is None  # a read stays a read


@pytest.mark.asyncio
async def test_contact_only_row_rebuilds_from_body_text(monkeypatch) -> None:
    """The production failure, end to end: 500 becomes a repaired 200."""
    repo = _FakeRepo({
        "id": 5,
        "cv_structured": {"contact": {"name": "ANURAAG KUMAR", "location": ""}},
        "body_text": "ANURAAG KUMAR\nEXPERIENCE\n- Shipped a thing",
    })

    async def _reparse(_raw_text: str) -> dict:
        return {**_FULL, "contact": {**_FULL["contact"], "name": "ANURAAG KUMAR"}}

    monkeypatch.setattr(cv_workflow.cv_parser, "reparse_structured_only", _reparse)

    payload = await cv_workflow.get_or_backfill_cv_structured(repo, "u1")

    CVStructuredResponse(**payload)
    assert payload["contact"]["name"] == "ANURAAG KUMAR"
    assert payload["experience"], "the rebuilt CV must carry the user's roles"
    assert repo.written is not None, "the repair must persist, not repeat per read"


@pytest.mark.asyncio
async def test_any_stored_shape_is_renderable_never_a_500(no_llm) -> None:
    """Whatever a past writer left behind, a row WITH content must render."""
    for stored in (
        {"experience": [{"company": "A", "role": "R", "dates": "", "bullets": ["x"]}]},  # no contact key
        {"contact": None, "certs": ["AWS"], "junk": 1},                                   # null contact, extra key
        {"summary": "S", "education": "not a list"},                                      # wrong types
    ):
        repo = _FakeRepo({"id": 9, "cv_structured": stored, "body_text": "text"})
        payload = await cv_workflow.get_or_backfill_cv_structured(repo, "u1")
        CVStructuredResponse(**payload)


@pytest.mark.asyncio
async def test_no_baseline_and_nothing_to_rebuild_from_are_404_not_500(no_llm) -> None:
    assert await cv_workflow.get_or_backfill_cv_structured(_FakeRepo(None), "u1") is None

    # cv_versions ids 3 and 7: contact-only AND body_text empty. Genuinely gone —
    # the honest answer is "upload one", never a 500 and never a blank editor.
    empty = _FakeRepo({"id": 3, "cv_structured": {"contact": {"name": ""}}, "body_text": ""})
    assert await cv_workflow.get_or_backfill_cv_structured(empty, "u1") is None


@pytest.mark.asyncio
async def test_failed_rebuild_is_503_and_never_hands_back_an_empty_cv(monkeypatch) -> None:
    """503 is deliberate. Returning the contact-only payload would put an empty
    editor in front of the user, and master autosave would then render that
    emptiness over `body_text` — destroying the only copy the repair reads."""
    repo = _FakeRepo({
        "id": 5,
        "cv_structured": {"contact": {"name": "ANURAAG KUMAR"}},
        "body_text": "ANURAAG KUMAR\nEXPERIENCE\n- Shipped a thing",
    })

    async def _provider_down(_raw_text: str) -> None:
        return None

    monkeypatch.setattr(cv_workflow.cv_parser, "reparse_structured_only", _provider_down)

    with pytest.raises(HTTPException) as exc:
        await cv_workflow.get_or_backfill_cv_structured(repo, "u1")

    assert exc.value.status_code == 503
    assert repo.written is None, "a failed rebuild must not overwrite the row"


# ── The repository read seam ─────────────────────────────────────────────────
# The write guards below only bind callers who go through the repository. The
# incident did not: an offline repair script wrote to the table directly, and so
# can a migration or an admin update. So the shape is settled on the way OUT,
# where every reader — router, service, script — is downstream of it.


class _Row:
    """Minimal supabase query stub returning one canned cv_versions row."""

    def __init__(self, row: dict | None) -> None:
        self._row = row

    def __getattr__(self, _name: str):
        return lambda *_a, **_k: self

    def execute(self):
        class _R:
            data = [self._row] if self._row else []
        return _R()


class _DB:
    def __init__(self, row: dict | None) -> None:
        self._row = row

    def table(self, _name: str) -> _Row:
        return _Row(self._row)


def _repo(cv_structured) -> CVVersionsRepository:
    return CVVersionsRepository(  # type: ignore[arg-type]
        _DB({"id": 5, "user_id": "u1", "kind": "baseline_upload",
             "body_text": "text", "cv_structured": cv_structured})
    )


def test_latest_baseline_hands_out_the_full_contract() -> None:
    """The production row, read back through the repository, is renderable."""
    row = _repo({"contact": {"name": "ANURAAG KUMAR"}}).latest_baseline("u1")

    assert set(row["cv_structured"]) == CONTRACT_KEYS
    CVStructuredResponse(**row["cv_structured"])
    assert row["cv_structured"]["contact"]["name"] == "ANURAAG KUMAR"
    assert row["body_text"] == "text", "normalization must not disturb the rest of the row"


def test_normalized_row_still_answers_do_we_have_a_cv_honestly() -> None:
    """Normalizing makes every payload truthy — so the emptiness has to stay
    visible through `has_content`, or the callers that gate on it silently start
    operating on a blank CV."""
    assert has_content(_repo({"contact": {"name": "A"}}).latest_baseline("u1")["cv_structured"]) is False
    assert has_content(_repo(_FULL).latest_baseline("u1")["cv_structured"]) is True


def test_absent_payload_is_left_absent() -> None:
    """`{}` means "not parsed yet" and the read path rebuilds it. Filling it with
    a hollow CV here would hide that state from the rebuild."""
    assert _repo({}).latest_baseline("u1")["cv_structured"] == {}
    assert _repo(None).latest_baseline("u1")["cv_structured"] is None


def test_normalizing_an_empty_result_is_not_an_error() -> None:
    """A read that found nothing must stay a clean "nothing", not an
    AttributeError inside the guard meant to make reads safe."""
    assert CVVersionsRepository._normalized(None) is None
    assert CVVersionsRepository._normalized({}) == {}
    assert _repo(None).latest_baseline("u1")["cv_structured"] is None
