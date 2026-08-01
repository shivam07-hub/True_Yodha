"""Repair CV contact blocks poisoned by the redaction placeholder.

Between 2026-07-25 and this fix, `cv_parser` asked the model for a contact block
it had already stripped from the prompt. The model returned the placeholder, and
`[REDACTED_CV_HEADER]` was persisted as users' names — then printed on CVs they
downloaded and sent to employers.

`body_text` was never sanitized, so the real header is still on every baseline
row. This re-derives the contact block from it, locally and deterministically.

Archive-safe: only `cv_structured.contact` is rewritten. No bullet, date, role,
or body text is touched. Rows whose contact is already clean are skipped.

    python -m scripts.repair_cv_contact              # dry run, prints a plan
    python -m scripts.repair_cv_contact --apply
"""

from __future__ import annotations

import argparse
import logging
import sys

from app.database import get_supabase_admin
from app.security.personal_data import contains_redaction_token
from app.services.cv_contact import parse_contact

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("repair_cv_contact")

_PAGE = 500


def _needs_repair(row: dict) -> bool:
    contact = (row.get("cv_structured") or {}).get("contact") or {}
    if not contact:
        return True
    return contains_redaction_token(contact)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the repairs (default: dry run)")
    parser.add_argument("--limit", type=int, default=0, help="stop after N repairs (0 = no cap)")
    args = parser.parse_args()

    db = get_supabase_admin()
    offset = 0
    scanned = repaired = skipped_no_text = unchanged = 0

    while True:
        page = (
            db.table("cv_versions")
            .select("id, user_id, body_text, cv_structured")
            .order("id")
            .range(offset, offset + _PAGE - 1)
            .execute()
        )
        rows = page.data or []
        if not rows:
            break
        offset += len(rows)

        for row in rows:
            scanned += 1
            if not _needs_repair(row):
                unchanged += 1
                continue

            body = row.get("body_text") or ""
            contact = parse_contact(body)
            if not contact["name"] and not contact["email"]:
                # Nothing recoverable — leave it empty rather than invent one.
                # An empty contact lets the UI fall back to the profile name;
                # the placeholder never could.
                skipped_no_text += 1

            structured = dict(row.get("cv_structured") or {})
            structured["contact"] = contact

            if contains_redaction_token(structured):
                logger.warning("row %s: redaction token outside contact — skipping, needs a look", row["id"])
                continue

            logger.info(
                "row %-7s %s -> name=%r email=%r",
                row["id"],
                "APPLY" if args.apply else "dry ",
                contact["name"],
                contact["email"],
            )
            if args.apply:
                db.table("cv_versions").update({"cv_structured": structured}).eq("id", row["id"]).execute()
            repaired += 1

            if args.limit and repaired >= args.limit:
                logger.info("hit --limit %d", args.limit)
                break
        if args.limit and repaired >= args.limit:
            break

    logger.info(
        "\nscanned=%d repaired=%d unchanged=%d unrecoverable=%d  (%s)",
        scanned, repaired, unchanged, skipped_no_text,
        "APPLIED" if args.apply else "DRY RUN — re-run with --apply",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
