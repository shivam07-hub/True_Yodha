"""A reword on a job's paper is job-scoped; the material still survives.

The rule this file holds (CV Weave lock L3, the Oracle master-pollution defect):
a line reworded for ONE job lands on that job's working draft, never on the
living master — JD language on the master rides into every other tailored copy.
But a reword is often where the user remembers real work, so the new text is
mirrored into the reservoir as an ALTERNATE phrasing: the master's canonical
wording does not move, and nothing the user typed is unrecoverable.
"""
from typing import Any

from app.repositories.cv import CVVersionsRepository
from app.routers.cv.versions import (
    JobDraftPatchRequest,
    LinePhrasing,
    patch_job_draft,
)


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _PointsQuery:
    """Enough of the PostgREST builder for the cv_points reservoir calls."""

    def __init__(self, sink: dict) -> None:
        self._sink = sink
        self._op = "select"
        self._payload: Any = None

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self._op == "insert":
            self._sink.setdefault("inserted", []).append(self._payload)
            return _Result([self._payload])
        if self._op == "update":
            self._sink.setdefault("updated", []).append(self._payload)
            return _Result([{}])
        return _Result(self._sink.get("canonical_rows", []))


class _DB:
    def __init__(self, sink: dict) -> None:
        self._sink = sink

    def table(self, _name: str) -> _PointsQuery:
        return _PointsQuery(self._sink)


def _repo(sink: dict) -> CVVersionsRepository:
    return CVVersionsRepository(_DB(sink))  # type: ignore[arg-type]


def _canonical_row() -> dict:
    return {"id": 11, "point_key": "pk1", "section": "experience", "ordering": 2}


# ── the repository rule ───────────────────────────────────────────────────────


def test_alternate_phrasing_does_not_demote_the_master_wording() -> None:
    sink = {"canonical_rows": [_canonical_row()]}
    appended = _repo(sink).append_phrasing(
        "u1", "experience:0", "Ran the migration", "Ran the Oracle cloud migration",
        source="tailor", canonical=False,
    )
    assert appended is True
    assert sink["inserted"][0]["is_canonical"] is False
    assert sink["inserted"][0]["text"] == "Ran the Oracle cloud migration"
    # The master's canonical phrasing is untouched — nothing was demoted.
    assert "updated" not in sink


def test_master_rewrite_still_promotes_and_demotes() -> None:
    sink = {"canonical_rows": [_canonical_row()]}
    _repo(sink).append_phrasing("u1", "experience:0", "Ran it", "Ran it, 40% faster")
    assert sink["inserted"][0]["is_canonical"] is True
    assert sink["updated"] == [{"is_canonical": False}]


# ── the router seam ───────────────────────────────────────────────────────────


class _FakeRepo:
    def __init__(self) -> None:
        self.mirrored: list[tuple] = []
        self.patched: dict | None = None

    def find(self, _version_id: int, _user_id: str) -> dict:
        return {
            "id": 7,
            "kind": "deterministic",
            "job_id": "acme-pm",
            "hidden_items": [],
            "section_order": None,
            "cv_structured": {
                "contact": {"name": "Ada"},
                "summary": "S",
                "experience": [{"company": "Acme", "role": "PM", "dates": "", "bullets": ["Ran the migration"]}],
                "projects": [],
                "education": [],
                "skills_line": "",
                "certs": [],
            },
        }

    def update_job_draft(self, version_id, user_id, *, cv_structured, body_text, title=None):
        self.patched = {"cv_structured": cv_structured, "body_text": body_text}
        return {
            **self.find(version_id, user_id),
            "cv_structured": cv_structured,
            "body_text": body_text,
            "edited_items": {},
            "user_version_number": 3,
            "created_at": "2026-09-01T00:00:00+00:00",
        }

    def append_phrasing(self, user_id, anchor, old_text, new_text, source="restructure", *, canonical=True):
        self.mirrored.append((anchor, old_text, new_text, source, canonical))
        return True


class _Principal:
    id = "u1"


def _patched(cv: dict) -> dict:
    return {**cv, "experience": [{**cv["experience"][0], "bullets": ["Ran the Oracle cloud migration"]}]}


def _call(repo: _FakeRepo, phrasing: LinePhrasing | None):
    base = repo.find(7, "u1")["cv_structured"]
    return patch_job_draft(
        version_id=7,
        body=JobDraftPatchRequest(cv_structured=_patched(base), phrasing=phrasing),
        principal=_Principal(),  # type: ignore[arg-type]
        cv_repo=repo,  # type: ignore[arg-type]
    )


def test_reword_mirrors_as_alternate_against_the_pre_patch_cv() -> None:
    repo = _FakeRepo()
    _call(repo, LinePhrasing(old_text="Ran the migration", new_text="Ran the Oracle cloud migration"))
    assert repo.patched is not None
    anchor, old_text, new_text, source, canonical = repo.mirrored[0]
    assert anchor == "experience:0"
    assert (old_text, new_text) == ("Ran the migration", "Ran the Oracle cloud migration")
    assert (source, canonical) == ("tailor", False)


def test_structural_patch_without_a_reword_writes_no_reservoir_row() -> None:
    repo = _FakeRepo()
    _call(repo, None)
    assert repo.patched is not None
    assert repo.mirrored == []


def test_unlocatable_line_is_skipped_not_guessed() -> None:
    repo = _FakeRepo()
    _call(repo, LinePhrasing(old_text="A line this CV never held", new_text="Anything"))
    assert repo.mirrored == []
