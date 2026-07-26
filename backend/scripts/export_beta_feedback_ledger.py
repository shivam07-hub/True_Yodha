"""Export beta feedback into the evidence-backed closure ledger.

The export intentionally excludes ``user_id`` and confirmation metadata. It is
safe to commit because it contains product feedback, not account identities.
"""

from __future__ import annotations

import argparse
from copy import deepcopy
import json
from pathlib import Path
import re
from typing import Any

BETA_PROGRAM = "intern_beta_assignment_v1"
_CLOSURE_STATUSES = {"unverified", "open", "partial", "fixed", "non_actionable"}
_FIXED_EVIDENCE_FIELDS = (
    "code_evidence",
    "deployment_evidence",
    "test_evidence",
    "metric_evidence",
    "user_validation",
    "closed_at",
)
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)")


def _empty_closure() -> dict[str, Any]:
    return {
        "status": "unverified",
        "priority": None,
        "themes": [],
        "root_cause": None,
        "owner": None,
        "code_evidence": [],
        "deployment_evidence": [],
        "test_evidence": [],
        "metric_evidence": [],
        "user_validation": None,
        "closed_at": None,
        "notes": None,
    }


def _redact_contacts(value: Any, counts: dict[str, int]) -> Any:
    if isinstance(value, dict):
        return {key: _redact_contacts(item, counts) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact_contacts(item, counts) for item in value]
    if not isinstance(value, str):
        return value

    value, email_count = _EMAIL_RE.subn("[REDACTED EMAIL]", value)
    value, phone_count = _PHONE_RE.subn("[REDACTED PHONE]", value)
    counts["email"] = counts.get("email", 0) + email_count
    counts["phone"] = counts.get("phone", 0) + phone_count
    return value


def fetch_beta_rows(db: Any, *, page_size: int = 500) -> list[dict[str, Any]]:
    """Read the complete beta corpus instead of relying on PostgREST's row cap."""
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        result = (
            db.table("user_feedback")
            .select("id, type, payload, created_at")
            .eq("type", "feedback")
            .eq("payload->>program", BETA_PROGRAM)
            .order("id")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        page = result.data or []
        rows.extend(page)
        if len(page) < page_size:
            return rows
        offset += page_size


def build_supabase_entry(row: dict[str, Any]) -> dict[str, Any]:
    """Convert one validated beta row into a privacy-safe ledger entry."""
    payload = row.get("payload") or {}
    if payload.get("program") != BETA_PROGRAM:
        raise ValueError(f"feedback row {row.get('id')} is not from {BETA_PROGRAM}")

    redactions: dict[str, int] = {}
    return {
        "source_id": f"supabase:user_feedback:{row['id']}",
        "source_type": "supabase_beta_feedback",
        "feedback_id": row["id"],
        "submitted_at": row.get("created_at"),
        "schema_version": payload.get("schema_version"),
        "role_stream": payload.get("role_stream"),
        "session": _redact_contacts(
            deepcopy(payload.get("session") or {}), redactions
        ),
        "assessment": _redact_contacts(
            deepcopy(payload.get("assessment") or {}), redactions
        ),
        "ratings": _redact_contacts(
            deepcopy(payload.get("ratings") or {}), redactions
        ),
        "redactions": {key: count for key, count in redactions.items() if count},
        "closure": _empty_closure(),
    }


def build_supplemental_entry(record: dict[str, Any]) -> dict[str, Any]:
    """Normalize a document or interview that has no Supabase row."""
    source_id = record.get("source_id")
    if not isinstance(source_id, str) or not source_id.startswith("attachment:"):
        raise ValueError("supplemental source_id must start with attachment:")
    redactions: dict[str, int] = {}
    return {
        "source_id": source_id,
        "source_type": "attachment",
        "source_ref": record.get("source_ref"),
        "attribution": record.get("attribution"),
        "feedback_id": None,
        "submitted_at": record.get("submitted_at"),
        "schema_version": record.get("schema_version", 1),
        "role_stream": record.get("role_stream"),
        "session": _redact_contacts(
            deepcopy(record.get("session") or {}), redactions
        ),
        "assessment": _redact_contacts(
            deepcopy(record.get("assessment") or {}), redactions
        ),
        "ratings": _redact_contacts(
            deepcopy(record.get("ratings") or {}), redactions
        ),
        "redactions": {key: count for key, count in redactions.items() if count},
        "closure": deepcopy(record.get("closure") or _empty_closure()),
    }


def merge_existing_closure(
    refreshed: dict[str, Any],
    existing: dict[str, Any] | None,
) -> dict[str, Any]:
    """Refresh source evidence without overwriting a human closure decision."""
    merged = deepcopy(refreshed)
    if existing and existing.get("source_id") == refreshed.get("source_id"):
        merged["closure"] = deepcopy(existing.get("closure") or {})
    return merged


def refresh_ledger(
    beta_entries: list[dict[str, Any]],
    *,
    supplemental_entries: list[dict[str, Any]],
    existing_by_source: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Refresh source evidence and fail closed on duplicate source identifiers."""
    entries = [*beta_entries, *supplemental_entries]
    seen: set[str] = set()
    refreshed: list[dict[str, Any]] = []
    for entry in entries:
        source_id = entry["source_id"]
        if source_id in seen:
            raise ValueError(f"duplicate ledger source_id: {source_id}")
        seen.add(source_id)
        refreshed.append(
            merge_existing_closure(entry, existing_by_source.get(source_id))
        )
    return refreshed


def validate_ledger(entries: list[dict[str, Any]]) -> None:
    """Enforce the evidence threshold before a concern can be marked fixed."""
    seen: set[str] = set()
    for entry in entries:
        source_id = entry.get("source_id")
        if not source_id or source_id in seen:
            raise ValueError(f"missing or duplicate source_id: {source_id}")
        seen.add(source_id)

        closure = entry.get("closure") or {}
        status = closure.get("status")
        if status not in _CLOSURE_STATUSES:
            raise ValueError(f"{source_id} has invalid closure status: {status}")
        if status == "fixed":
            missing = [
                field for field in _FIXED_EVIDENCE_FIELDS if not closure.get(field)
            ]
            if missing:
                raise ValueError(
                    f"{source_id} cannot be fixed without: {', '.join(missing)}"
                )


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def write_jsonl(path: Path, entries: list[dict[str, Any]]) -> None:
    validate_ledger(entries)
    path.parent.mkdir(parents=True, exist_ok=True)
    body = "".join(
        json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n"
        for entry in entries
    )
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(body, encoding="utf-8")
    temporary.replace(path)


def _load_supplements(path: Path | None) -> list[dict[str, Any]]:
    if path is None or not path.exists():
        return []
    records = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise ValueError("supplement file must contain a JSON list")
    return [build_supplemental_entry(record) for record in records]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(
            "docs/beta-testing/closure-ledger/beta-feedback-closure-ledger.jsonl"
        ),
    )
    parser.add_argument(
        "--supplement",
        type=Path,
        default=Path(
            "docs/beta-testing/closure-ledger/supplemental-feedback.json"
        ),
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="validate the existing ledger without connecting to Supabase",
    )
    args = parser.parse_args()

    existing_entries = read_jsonl(args.output)
    if args.validate_only:
        validate_ledger(existing_entries)
        print(f"Validated {len(existing_entries)} closure-ledger entries.")
        return

    from app.database import get_supabase_admin

    rows = fetch_beta_rows(get_supabase_admin())
    beta_entries = [build_supabase_entry(row) for row in rows]
    existing_by_source = {
        entry["source_id"]: entry for entry in existing_entries
    }
    entries = refresh_ledger(
        beta_entries,
        supplemental_entries=_load_supplements(args.supplement),
        existing_by_source=existing_by_source,
    )
    write_jsonl(args.output, entries)
    print(
        f"Wrote {len(beta_entries)} Supabase rows and "
        f"{len(entries) - len(beta_entries)} supplements to {args.output}."
    )


if __name__ == "__main__":
    main()
