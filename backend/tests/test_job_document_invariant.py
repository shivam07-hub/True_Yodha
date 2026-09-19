"""ADR-0025 — one document per job, held structurally.

The defect this closes was invisible to every test: three writers minted
`kind='deterministic'` rows for one job, one reader ranked them by version
number, and a playground Save seeded from the untouched master silently
overwrote a user's accepted Tailor lines (prod, 2026-08-30).

Nothing failed. These are the cheap version of that discovery.
"""
from __future__ import annotations

import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "app"
FRONTEND = Path(__file__).resolve().parents[2] / "frontend"


def _read(rel: str, root: Path = BACKEND) -> str:
    return (root / rel).read_text()


def test_the_job_document_reader_does_not_filter_on_kind():
    """Rule 4: kind is a lineage label, not identity. Filtering it here is what
    made a polished tailored CV invisible to the next Keep/Take."""
    src = _read("repositories/cv.py")
    body = src[src.index("def job_document"):src.index("def latest_for_thread_batch")]
    assert '.eq("job_id", job_id)' in body
    assert '"kind"' not in body, "the job document is the newest row of ANY kind"
    assert "latest_job_draft" not in src, "the superseded reader must be gone, not parked"


def test_the_in_place_writer_is_scoped_by_job_not_by_kind():
    src = _read("repositories/cv.py")
    body = src[src.index("def update_job_draft"):src.index("def set_master_hidden_items")]
    assert '.not_.is_("job_id", "null")' in body
    assert '.eq("kind", "deterministic")' not in body


def test_no_backend_endpoint_still_gates_a_job_write_on_kind():
    """Rule 4 again, at the routers. Each of these refusals sent a polished
    tailored CV down a create path that minted a rival copy."""
    for rel in ("routers/cv/versions.py", "routers/cv/weave.py", "routers/cv/career.py"):
        src = _read(rel)
        assert 'kind") != "deterministic"' not in src, f"{rel} still ranks by kind"


def test_every_job_scoped_writer_seeds_from_the_document():
    """Rule 2. A writer that reads `latest_baseline` and creates unconditionally
    is the Save bug wearing a different name."""
    for rel in ("routers/cv/versions.py", "routers/cv/career.py"):
        src = _read(rel)
        assert "cv_repo.job_document(" in src, f"{rel} never asks for the job document"


def test_save_patches_an_existing_document_instead_of_minting_a_sibling():
    src = _read("routers/cv/versions.py")
    body = src[src.index("def create_cv_version"):src.index("def edit_cv_version_structured")]
    doc_at = body.index("cv_repo.job_document(")
    create_at = body.index("cv_repo.create(")
    assert doc_at < create_at, "the document is resolved BEFORE any create"
    assert "update_job_draft" in body[doc_at:create_at], "an existing document is patched"


def test_the_projection_replaces_the_document_rather_than_filing_a_rival():
    src = _read("routers/cv/career.py")
    body = src[src.index("cv_repo.job_document("):]
    assert "update_job_draft" in body[:600]


def test_the_playground_never_treats_a_polished_cv_as_no_draft():
    """The frontend half of rule 4 — the gate that fell through to create."""
    src = _read("lib/hooks/use-cv-playground.ts", FRONTEND)
    assert not re.search(r'kind === "deterministic" && sel\.job_id', src)
    assert "sel && sel.job_id" in src


def test_adr_0024_is_the_written_record():
    adr = Path(__file__).resolve().parents[2] / "docs" / "adr" / "0025-one-document-per-job.md"
    assert adr.is_file(), "the decision must be citable, or it gets re-litigated"
    text = adr.read_text()
    assert "**Status:** Accepted" in text
    assert "job_document" in text
