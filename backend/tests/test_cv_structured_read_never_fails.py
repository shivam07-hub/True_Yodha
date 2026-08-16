"""The CV read seam may never fail on the SHAPE of a stored row.

Reading back your own CV is the product. A user who cannot open or download the
CV they uploaded has nothing, and that is precisely what happened between
2026-04-18 and 2026-08-08 for six users: the read gated on `if structured:` —
truthiness, not shape — so a row holding `{"contact": {...}}` skipped past
`has_content` and went straight into a 7-field response model. 500 on every
load, with a parseable `body_text` sitting in the same row.

A GET must not invent the missing paper JSON. That is a named write
(`cv_structured_enrich`). Display reads `body_text` until `has_content`.
"""

from app.repositories.cv import CVVersionsRepository
from app.routers.cv.structured import CVStructuredResponse
from app.services import cv_workflow
from app.services.cv_structured_shape import CONTRACT_KEYS, has_content


class _FakeRepo:
    """Stands in for CVVersionsRepository — only the methods the seam calls."""

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


def test_healthy_row_is_returned_untouched() -> None:
    repo = _FakeRepo({"id": 1, "cv_structured": _FULL, "body_text": "irrelevant"})

    payload = cv_workflow.get_stored_cv_structured(repo, "u1")

    assert CVStructuredResponse(**payload).summary == "Engineer."
    assert repo.written is None  # a read stays a read


def test_contact_only_row_is_not_invented_on_read() -> None:
    """body_text is the Durable Answer. GET must not run a layout LLM."""
    repo = _FakeRepo({
        "id": 5,
        "cv_structured": {"contact": {"name": "ANURAAG KUMAR", "location": ""}},
        "body_text": "ANURAAG KUMAR\nEXPERIENCE\n- Shipped a thing",
    })

    payload = cv_workflow.get_stored_cv_structured(repo, "u1")

    assert payload is None
    assert repo.written is None


def test_any_stored_shape_with_content_is_renderable_never_a_500() -> None:
    """Whatever a past writer left behind, a row WITH content must render."""
    for stored in (
        {"experience": [{"company": "A", "role": "R", "dates": "", "bullets": ["x"]}]},  # no contact key
        {"contact": None, "certs": ["AWS"], "junk": 1},                                   # null contact, extra key
        {"summary": "S", "education": "not a list"},                                      # wrong types
    ):
        repo = _FakeRepo({"id": 9, "cv_structured": stored, "body_text": "text"})
        payload = cv_workflow.get_stored_cv_structured(repo, "u1")
        CVStructuredResponse(**payload)


def test_no_baseline_and_empty_row_are_none_not_500() -> None:
    assert cv_workflow.get_stored_cv_structured(_FakeRepo(None), "u1") is None

    empty = _FakeRepo({"id": 3, "cv_structured": {"contact": {"name": ""}}, "body_text": ""})
    assert cv_workflow.get_stored_cv_structured(empty, "u1") is None


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
    """`{}` means "not parsed yet". Filling it with a hollow CV here would hide
    that state from display, which reads `body_text` until `has_content`."""
    assert _repo({}).latest_baseline("u1")["cv_structured"] == {}
    assert _repo(None).latest_baseline("u1")["cv_structured"] is None


def test_normalizing_an_empty_result_is_not_an_error() -> None:
    """A read that found nothing must stay a clean "nothing", not an
    AttributeError inside the guard meant to make reads safe."""
    assert CVVersionsRepository._normalized(None) is None
    assert CVVersionsRepository._normalized({}) == {}
    assert _repo(None).latest_baseline("u1")["cv_structured"] is None
