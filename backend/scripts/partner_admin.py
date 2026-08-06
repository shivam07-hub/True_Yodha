"""Provision partners and their API keys.

There is no self-serve partner signup and there should not be one until partners
outnumber the people who can run this script. Onboarding a partner is four
commands and a copy-paste of two secrets.

The raw API key is printed ONCE and never stored — only sha256 of it reaches the
database. Losing it means minting a new one, not recovering the old one.

Usage:
    python -m scripts.partner_admin create --slug finlatics --name "Finlatics"
    python -m scripts.partner_admin key --slug finlatics --scopes sso,jobs.read,webhooks.manage
    python -m scripts.partner_admin list
    python -m scripts.partner_admin revoke --prefix <key_prefix>
"""

from __future__ import annotations

import argparse
import sys

from app.database import get_supabase_admin
from app.repositories.partners import PartnersRepository
from app.security.partner_auth import ALL_SCOPES


def _repo() -> PartnersRepository:
    return PartnersRepository(get_supabase_admin())


def cmd_create(args: argparse.Namespace) -> int:
    repo = _repo()
    if repo.get_partner_by_slug(args.slug):
        print(f"Partner '{args.slug}' already exists.")
        return 1
    partner = repo.create_partner(slug=args.slug, name=args.name)
    print(f"Created partner {partner.get('slug')} (id={partner.get('id')})")
    return 0


def cmd_key(args: argparse.Namespace) -> int:
    repo = _repo()
    partner = repo.get_partner_by_slug(args.slug)
    if not partner:
        print(f"No partner '{args.slug}'. Create it first.")
        return 1
    scopes = [s.strip() for s in args.scopes.split(",") if s.strip()]
    unknown = [s for s in scopes if s not in ALL_SCOPES]
    if unknown:
        print(f"Unknown scopes: {', '.join(unknown)}. Known: {', '.join(ALL_SCOPES)}")
        return 1
    raw = repo.mint_api_key(str(partner["id"]), scopes=scopes, label=args.label)
    print("API key (shown once — store it now):\n")
    print(f"  {raw}\n")
    print(f"scopes: {', '.join(scopes)}")
    return 0


def cmd_list(_: argparse.Namespace) -> int:
    admin = get_supabase_admin()
    partners = admin.table("partners").select("id, slug, name, status, created_at").execute().data or []
    for row in partners:
        keys = (
            admin.table("partner_api_keys")
            .select("key_prefix, scopes, revoked_at, last_used_at")
            .eq("partner_id", row["id"])
            .execute()
            .data
            or []
        )
        print(f"{row['slug']:<20} {row['name']:<30} {row['status']}")
        for key in keys:
            state = "revoked" if key.get("revoked_at") else "live"
            print(f"    {key['key_prefix']}  {state:<8} {','.join(key.get('scopes') or [])}")
    return 0


def cmd_revoke(args: argparse.Namespace) -> int:
    admin = get_supabase_admin()
    from datetime import datetime, timezone

    admin.table("partner_api_keys").update(
        {"revoked_at": datetime.now(timezone.utc).isoformat()}
    ).eq("key_prefix", args.prefix).execute()
    print(f"Revoked key prefix {args.prefix}.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create", help="Create a partner")
    create.add_argument("--slug", required=True)
    create.add_argument("--name", required=True)
    create.set_defaults(func=cmd_create)

    key = sub.add_parser("key", help="Mint an API key for a partner")
    key.add_argument("--slug", required=True)
    key.add_argument("--scopes", default=",".join(ALL_SCOPES))
    key.add_argument("--label", default=None)
    key.set_defaults(func=cmd_key)

    listing = sub.add_parser("list", help="List partners and keys")
    listing.set_defaults(func=cmd_list)

    revoke = sub.add_parser("revoke", help="Revoke an API key by prefix")
    revoke.add_argument("--prefix", required=True)
    revoke.set_defaults(func=cmd_revoke)

    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
