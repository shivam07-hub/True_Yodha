from __future__ import annotations

from typing import Any

import pytest

from scripts.export_beta_feedback_ledger import (
    build_supplemental_entry,
    build_supabase_entry,
    fetch_beta_rows,
    merge_existing_closure,
    read_jsonl,
    refresh_ledger,
    validate_ledger,
    write_jsonl,
)


def test_build_supabase_entry_preserves_feedback_without_identity() -> None:
    row = {
        "id": 114,
        "user_id": "must-not-leak",
        "type": "feedback",
        "created_at": "2026-07-08T12:00:00Z",
        "payload": {
            "program": "intern_beta_assignment_v1",
            "schema_version": 1,
            "role_stream": "Product",
            "session": {
                "device_type": "Mobile",
                "session_outcome": "Partial",
            },
            "assessment": {
                "biggest_problem_area": "CV upload",
                "biggest_problem": "The revised CV was difficult to operate.",
                "priority_improvement": "Make the next action obvious.",
            },
            "ratings": {"next_step": 2},
        },
    }

    entry = build_supabase_entry(row)

    assert entry["source_id"] == "supabase:user_feedback:114"
    assert entry["feedback_id"] == 114
    assert entry["assessment"]["biggest_problem"] == (
        "The revised CV was difficult to operate."
    )
    assert entry["closure"]["status"] == "unverified"
    assert "user_id" not in entry
    assert "confirmations" not in entry


def test_merge_existing_closure_preserves_human_review() -> None:
    refreshed = {
        "source_id": "supabase:user_feedback:114",
        "assessment": {"biggest_problem": "Fresh source text"},
        "closure": {"status": "unverified", "priority": None, "themes": []},
    }
    existing = {
        "source_id": "supabase:user_feedback:114",
        "assessment": {"biggest_problem": "Old source text"},
        "closure": {
            "status": "partial",
            "priority": "P0",
            "themes": ["cv_upload"],
            "notes": "Transport fixed; mobile acceptance remains.",
        },
    }

    merged = merge_existing_closure(refreshed, existing)

    assert merged["assessment"]["biggest_problem"] == "Fresh source text"
    assert merged["closure"] == existing["closure"]


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _PagedQuery:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.ranges: list[tuple[int, int]] = []

    def table(self, _name: str) -> "_PagedQuery":
        return self

    def select(self, *_args: Any) -> "_PagedQuery":
        return self

    def eq(self, *_args: Any) -> "_PagedQuery":
        return self

    def order(self, *_args: Any, **_kwargs: Any) -> "_PagedQuery":
        return self

    def range(self, start: int, end: int) -> "_PagedQuery":
        self.ranges.append((start, end))
        return self

    def execute(self) -> _Result:
        start, end = self.ranges[-1]
        return _Result(self.rows[start : end + 1])


def test_fetch_beta_rows_paginates_until_the_last_page() -> None:
    rows = [{"id": row_id} for row_id in range(1, 6)]
    query = _PagedQuery(rows)

    result = fetch_beta_rows(query, page_size=2)

    assert result == rows
    assert query.ranges == [(0, 1), (2, 3), (4, 5)]


def test_refresh_ledger_keeps_supplements_separate_and_ids_unique() -> None:
    beta = build_supabase_entry(
        {
            "id": 1,
            "type": "feedback",
            "created_at": "2026-07-01T00:00:00Z",
            "payload": {
                "program": "intern_beta_assignment_v1",
                "assessment": {"biggest_problem": "Slow page"},
            },
        }
    )
    supplement = build_supplemental_entry(
        {
            "source_id": "attachment:usha-bhatiya-pdf",
            "source_ref": "Document from Usha Bhatiya.pdf",
            "attribution": (
                "Document attribution only; no exact Supabase identity match."
            ),
            "assessment": {"biggest_problem": "Upload failed multiple times."},
        }
    )
    existing = {
        beta["source_id"]: {
            **beta,
            "closure": {"status": "partial", "priority": "P0"},
        }
    }

    entries = refresh_ledger(
        [beta],
        supplemental_entries=[supplement],
        existing_by_source=existing,
    )

    assert [entry["source_id"] for entry in entries] == [
        "supabase:user_feedback:1",
        "attachment:usha-bhatiya-pdf",
    ]
    assert entries[0]["closure"]["status"] == "partial"
    assert entries[1]["feedback_id"] is None
    assert "Supabase" in entries[1]["attribution"]


def test_validate_ledger_refuses_unsupported_fixed_claim() -> None:
    entry = build_supplemental_entry(
        {
            "source_id": "attachment:test",
            "source_ref": "test.pdf",
            "assessment": {"biggest_problem": "A real problem"},
            "closure": {
                "status": "fixed",
                "priority": "P0",
                "themes": ["reliability"],
            },
        }
    )

    with pytest.raises(ValueError, match="cannot be fixed without"):
        validate_ledger([entry])


def test_jsonl_round_trip_preserves_verbatim_feedback(tmp_path) -> None:
    path = tmp_path / "ledger.jsonl"
    entry = build_supplemental_entry(
        {
            "source_id": "attachment:test",
            "source_ref": "test.pdf",
            "assessment": {
                "biggest_problem": 'Received "Network request failed" twice.'
            },
        }
    )

    write_jsonl(path, [entry])

    assert read_jsonl(path) == [entry]
    assert len(path.read_text(encoding="utf-8").splitlines()) == 1


def test_build_supabase_entry_redacts_contact_details_from_free_text() -> None:
    entry = build_supabase_entry(
        {
            "id": 128,
            "type": "feedback",
            "created_at": "2026-07-08T00:00:00Z",
            "payload": {
                "program": "intern_beta_assignment_v1",
                "assessment": {
                    "biggest_problem": (
                        "Contact me at candidate@example.com or 9876543210."
                    )
                },
            },
        }
    )

    assert entry["assessment"]["biggest_problem"] == (
        "Contact me at [REDACTED EMAIL] or [REDACTED PHONE]."
    )
    assert entry["redactions"] == {"email": 1, "phone": 1}
