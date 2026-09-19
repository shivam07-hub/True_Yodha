"""A file billed as a paste is retagged on the next visit, not backfilled."""

from __future__ import annotations

from typing import Any

from app.services.cv_entry_heal import file_tagged_as_text, heal_loaded
from app.services.cv_workflow import charge_action_for_source
from app.services import forward_pass


class _Table:
    def __init__(self, db: "_Db", name: str) -> None:
        self._db = db
        self._name = name

    def update(self, payload: dict[str, Any]) -> "_Table":
        self._db.writes.append((self._name, "update", dict(payload)))
        return self

    def upsert(self, payload: dict[str, Any], **_k: Any) -> "_Table":
        self._db.writes.append((self._name, "upsert", dict(payload)))
        return self

    def eq(self, *_a: Any, **_k: Any) -> "_Table":
        return self

    def execute(self) -> None:
        return None


class _Db:
    def __init__(self) -> None:
        self.writes: list[tuple[str, str, dict[str, Any]]] = []

    def table(self, name: str) -> _Table:
        return _Table(self, name)


def test_a_file_source_charges_as_a_file_even_on_the_text_route() -> None:
    assert charge_action_for_source("pdf_upload") == "cv_upload"
    assert charge_action_for_source("linkedin_pdf") == "cv_upload"
    assert charge_action_for_source("text_describe") == "cv_upload_text"
    assert charge_action_for_source("generated_baseline") == "cv_upload_text"


def test_file_tagged_as_text_needs_a_filename_and_the_paste_source() -> None:
    assert file_tagged_as_text("text_describe", {"name": "Rupanjana.pdf"}) is True
    assert file_tagged_as_text("pdf_upload", {"name": "Rupanjana.pdf"}) is False
    assert file_tagged_as_text("text_describe", {}) is False
    assert file_tagged_as_text("text_describe", {"name": "  "}) is False


def test_heal_retags_source_and_entry_mode() -> None:
    db = _Db()
    assert heal_loaded(
        db,
        "u1",
        {
            "entry_mode": "description",
            "accepted_file_metadata": {"name": "ada.pdf"},
        },
        {"id": 9, "source": "text_describe"},
    ) is True
    assert ("cv_versions", "update", {"source": "pdf_upload"}) in db.writes
    upserts = [payload for table, op, payload in db.writes if op == "upsert"]
    assert upserts and upserts[0]["entry_mode"] == "uploaded_cv"


def test_heal_does_not_rewrite_entry_mode_when_it_already_says_uploaded() -> None:
    db = _Db()
    assert heal_loaded(
        db,
        "u1",
        {
            "entry_mode": "uploaded_cv",
            "accepted_file_metadata": {"name": "ada.pdf"},
        },
        {"id": 9, "source": "text_describe"},
    ) is True
    assert db.writes == [("cv_versions", "update", {"source": "pdf_upload"})]


def test_heal_is_a_no_op_when_the_record_already_agrees() -> None:
    db = _Db()
    assert heal_loaded(
        db,
        "u1",
        {
            "entry_mode": "uploaded_cv",
            "accepted_file_metadata": {"name": "ada.pdf"},
        },
        {"id": 9, "source": "pdf_upload"},
    ) is False
    assert db.writes == []


def test_cv_source_is_a_registered_forward_pass() -> None:
    names = [name for name, _run in forward_pass.PASSES]
    assert "cv_source" in names
