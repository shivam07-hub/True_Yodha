"""Put the QA account back in front of the front door — the repeatable U4 path.

U4 ("after upload, the next step is obvious") can only be run by an account
that has not been through it, and every run walks the account past it: the
door completes onboarding and saves a first role. This puts it back, so the
door can be QA'd again on desktop or at 375px without a new signup.

  --to skills   just after an upload: the CV's skills are unconfirmed, then
                the door (default)
  --to door     the skills stay confirmed; straight to "Which job do you want?"

Dev and prod share ONE database, so this refuses any account that is not
`is_test_account`. It writes only with --apply; without it, it prints the plan.

Usage (from backend/):
    python -m scripts.qa_front_door show <email>
    python -m scripts.qa_front_door reset <email> [--to skills|door] [--apply]
"""
from __future__ import annotations

import argparse
import sys
from typing import Any

from app.database import get_supabase_admin

Write = tuple[str, dict[str, Any], dict[str, Any]]


class RefusedAccount(Exception):
    """Not an account this script may touch, or not in a state it can reset."""


def reset_writes(
    profile: dict[str, Any],
    state: dict[str, Any] | None,
    baseline: dict[str, Any] | None,
    *,
    to: str,
) -> list[Write]:
    """Pure: the updates that put this account in front of the door."""
    if profile.get("is_test_account") is not True:
        raise RefusedAccount("not a test account — refusing to touch a real person")
    user_id = str(profile["id"])
    writes: list[Write] = [
        # The door stands only before onboarding is complete and before a first
        # role is saved (onboarding_service: completed_at, credible_job_saved_at).
        ("user_onboarding_state", {"user_id": user_id},
         {"completed_at": None, "credible_job_saved_at": None}),
        # …and only for someone with no direction yet.
        ("user_profiles", {"id": user_id}, {
            "onboarding_complete": False,
            "target_role_title": None, "target_role_titles": [], "target_roles": [],
        }),
    ]
    if to == "skills":
        if not baseline:
            raise RefusedAccount("no uploaded CV — upload one first; there is nothing to check")
        writes.append(("cv_versions", {"id": baseline["id"]}, {"skills_confirmed_at": None}))
    elif to != "door":
        raise RefusedAccount(f"unknown --to {to!r}")
    return writes


def _facts(db: Any, email: str) -> tuple[dict[str, Any], dict[str, Any] | None, dict[str, Any] | None]:
    rows = (
        db.table("user_profiles")
        .select("id, email, is_test_account, onboarding_complete, target_role_title, target_role_titles")
        .eq("email", email.strip().lower())
        .execute()
    ).data or []
    if not rows:
        raise RefusedAccount(f"no profile for {email}")
    profile = rows[0]
    state = (
        db.table("user_onboarding_state")
        .select("completed_at, credible_job_saved_at")
        .eq("user_id", profile["id"])
        .execute()
    ).data or [None]
    baseline = (
        db.table("cv_versions")
        .select("id, skills_confirmed_at, created_at")
        .eq("user_id", profile["id"])
        .eq("kind", "baseline_upload")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data or [None]
    return profile, state[0], baseline[0]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    show = sub.add_parser("show")
    show.add_argument("email")
    reset = sub.add_parser("reset")
    reset.add_argument("email")
    reset.add_argument("--to", default="skills", choices=("skills", "door"))
    reset.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)

    db = get_supabase_admin()
    try:
        profile, state, baseline = _facts(db, args.email)
        print(f"profile  {profile}")
        print(f"state    {state}")
        print(f"baseline {baseline}")
        if args.cmd == "show":
            return 0
        writes = reset_writes(profile, state, baseline, to=args.to)
    except RefusedAccount as exc:
        print(f"refused: {exc}")
        return 1
    for table, match, values in writes:
        print(f"{'WRITE' if args.apply else 'would write'} {table} {match} <- {values}")
        if args.apply:
            query = db.table(table).update(values)
            for column, value in match.items():
                query = query.eq(column, value)
            query.execute()
    print("done" if args.apply else "nothing written — pass --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
