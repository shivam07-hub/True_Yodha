"""Who is on the golden list (#59 §6) — the people Shivam names as job-hunting now.

`match` only prints candidates; Shivam confirms one; `add`/`remove` write only
with `--apply`. The list is one column, `user_profiles.golden_list_since`.

Usage:
    python -m scripts.golden_list list
    python -m scripts.golden_list match "Rishabh Guha"
    python -m scripts.golden_list add <user_id> --apply
    python -m scripts.golden_list remove <user_id> --apply
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from typing import Any

from app.database import get_supabase_admin


def _counts(db: Any, user_id: str) -> str:
    cvs = db.table("cv_versions").select("job_id").eq("user_id", user_id).execute().data or []
    apps = db.table("job_applications").select("status").eq("user_id", user_id).execute().data or []
    tailored = sum(1 for v in cvs if v.get("job_id"))
    applied = sum(1 for a in apps if (a.get("status") or "saved") != "saved")
    has_cv = any(not v.get("job_id") for v in cvs)
    return f"cv={'yes' if has_cv else 'no'} tailored={tailored} applied={applied}"


def cmd_list(db: Any, _args: argparse.Namespace) -> int:
    rows = (
        db.table("user_profiles")
        .select("id, full_name, golden_list_since, digest_unsubscribed_at, is_test_account")
        .not_.is_("golden_list_since", "null")
        .order("golden_list_since")
        .execute()
    ).data or []
    for row in rows:
        flags = " unsubscribed" if row.get("digest_unsubscribed_at") else ""
        flags += " TEST-ACCOUNT" if row.get("is_test_account") else ""
        print(f"{row['id']}  {row.get('full_name') or '—'}  since {row['golden_list_since'][:10]}{flags}  {_counts(db, row['id'])}")
    print(f"{len(rows)} on the list")
    return 0


def cmd_match(db: Any, args: argparse.Namespace) -> int:
    rows = (
        db.table("user_profiles")
        .select("id, full_name, created_at, golden_list_since, is_test_account")
        .ilike("full_name", f"%{args.name.strip()}%")
        .execute()
    ).data or []
    for row in rows:
        email = getattr(db.auth.admin.get_user_by_id(row["id"]).user, "email", None)
        on = " ON-LIST" if row.get("golden_list_since") else ""
        test = " TEST-ACCOUNT" if row.get("is_test_account") else ""
        print(f"{row['id']}  {row.get('full_name')}  {email}  signed up {row['created_at'][:10]}{on}{test}  {_counts(db, row['id'])}")
    print(f"{len(rows)} candidate(s) — nothing written")
    return 0


def _set(db: Any, user_id: str, value: str | None, apply: bool) -> int:
    if not apply:
        print(f"would set golden_list_since={value} for {user_id} (add --apply)")
        return 0
    db.table("user_profiles").update({"golden_list_since": value}).eq("id", user_id).execute()
    print(f"golden_list_since={value} for {user_id}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    match = sub.add_parser("match")
    match.add_argument("name")
    for name in ("add", "remove"):
        cmd = sub.add_parser(name)
        cmd.add_argument("user_id")
        cmd.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    db = get_supabase_admin()
    if args.cmd == "list":
        return cmd_list(db, args)
    if args.cmd == "match":
        return cmd_match(db, args)
    value = datetime.now(timezone.utc).isoformat() if args.cmd == "add" else None
    return _set(db, args.user_id, value, args.apply)


if __name__ == "__main__":
    sys.exit(main())
