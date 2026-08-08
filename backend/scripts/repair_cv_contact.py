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
    """A row needs repair when it carries a redaction marker, or simply has no
    identity. `{"name": "", "email": ""}` is a non-empty dict but an empty
    contact — testing dict truthiness alone left those CVs nameless."""
    contact = (row.get("cv_structured") or {}).get("contact") or {}
    if contains_redaction_token(contact):
        return True
    return not (contact.get("name") or contact.get("email"))


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
            if not structured:
                # A row with NO structured payload is not missing a contact — it is
                # waiting to be rebuilt from body_text on first read, and that
                # rebuild derives the contact itself. Writing `contact` alone here
                # turns a self-healing NULL into `{"contact": {...}}`: truthy, so
                # the rebuild is skipped, and short of the contract, so every read
                # 500s. That is exactly what this script did to six rows.
                logger.info("row %-7s skip — no structured payload; the read path rebuilds it", row["id"])
                unchanged += 1
                continue
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

    inherited = _inherit_pass(db, apply=args.apply)

    logger.info(
        "\nscanned=%d repaired=%d inherited=%d unchanged=%d unrecoverable=%d  (%s)",
        scanned, repaired, inherited, unchanged, max(0, skipped_no_text - inherited),
        "APPLIED" if args.apply else "DRY RUN — re-run with --apply",
    )
    return 0


def _has_identity(row: dict) -> bool:
    contact = (row.get("cv_structured") or {}).get("contact") or {}
    return bool(contact.get("name") or contact.get("email"))


def _inherit_pass(db, *, apply: bool) -> int:
    """Fill rows whose own text has no header from the same user's other CV.

    Myro-composed versions (`cv_compose`) start at `EXPERIENCE`, because they were
    written while the contact block was empty — the defect propagating itself.
    There is nothing to parse out of them. Carrying the owner's own baseline
    contact forward is not invention: `career_projection` already does exactly
    that for every projection it builds.
    """
    rows = (
        db.table("cv_versions").select("id, user_id, cv_structured").order("id").limit(10_000).execute()
    ).data or []

    best: dict[str, dict] = {}
    for row in rows:
        if _has_identity(row) and row["user_id"] not in best:
            best[row["user_id"]] = (row.get("cv_structured") or {})["contact"]

    filled = 0
    for row in rows:
        if _has_identity(row):
            continue
        source = best.get(row["user_id"])
        if not source:
            continue
        structured = dict(row.get("cv_structured") or {})
        if not structured:
            continue  # same rule as the parse pass — never create a contact-only row
        structured["contact"] = dict(source)
        logger.info("row %-7s %s inherit -> name=%r", row["id"], "APPLY" if apply else "dry ", source.get("name"))
        if apply:
            db.table("cv_versions").update({"cv_structured": structured}).eq("id", row["id"]).execute()
        filled += 1
    return filled


if __name__ == "__main__":
    sys.exit(main())
