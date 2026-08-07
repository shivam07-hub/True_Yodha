"""partners — identity for B2B distribution partners and their end users.

Service-role only: every table here has RLS on with no policies, so no end-user
token can reach them. The repository takes an admin client explicitly rather than
through `get_user_db`, so a route that forgets partner auth cannot accidentally
read a partner's roster with a user's JWT.

Two objects live here:
  • the partner and its API keys (authentication)
  • `partner_users`, the link between THEIR user id and OUR auth user (identity)

Key storage: only sha256(raw key) is persisted. Lookup is by the non-secret
`key_prefix`; the secret half is compared in constant time. A dump of this table
yields no working credential.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)

_KEY_PREFIX_BYTES = 6   # 12 hex chars — the public half we log and display
_KEY_SECRET_BYTES = 32  # 64 hex chars — the secret half


@dataclass(frozen=True)
class PartnerCredential:
    """A resolved, live API key: who is calling and what they may do."""

    key_id: str
    partner_id: str
    slug: str
    name: str
    scopes: frozenset[str]

    def has_scope(self, scope: str) -> bool:
        return scope in self.scopes


def hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_key(*, tier: str = "live") -> tuple[str, str, str]:
    """Return (raw_key, key_prefix, key_hash). The raw key is never stored."""
    prefix = secrets.token_hex(_KEY_PREFIX_BYTES)
    secret = secrets.token_hex(_KEY_SECRET_BYTES)
    raw = f"myro_{tier}_{prefix}_{secret}"
    return raw, prefix, hash_key(raw)


_KEY_TIERS = frozenset({"live", "test"})


def parse_key_prefix(raw_key: str) -> str | None:
    """Pull the public prefix out of a presented key without trusting the rest.

    Every part is checked, including the tier — a key is `myro_<tier>_<prefix>_<secret>`
    and anything else never reaches a database lookup.
    """
    parts = (raw_key or "").strip().split("_")
    if len(parts) != 4 or parts[0] != "myro" or parts[1] not in _KEY_TIERS:
        return None
    if not parts[2] or not parts[3]:
        return None
    return parts[2]


class PartnersRepository:
    """Reads and writes the partner identity tables. Admin client only."""

    def __init__(self, admin_db: Client) -> None:
        self._db = admin_db

    # ── authentication ──────────────────────────────────────────────────────

    def resolve_credential(self, raw_key: str) -> PartnerCredential | None:
        """Resolve a presented API key to a live credential, or None.

        None covers every failure the caller must treat identically (unknown
        prefix, wrong secret, revoked key, suspended partner) so the 401 it
        raises cannot be used to probe which keys exist.
        """
        prefix = parse_key_prefix(raw_key)
        if not prefix:
            return None
        resp = (
            self._db.table("partner_api_keys")
            .select("id, partner_id, key_hash, scopes, revoked_at, partners(slug, name, status)")
            .eq("key_prefix", prefix)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            return None
        row = rows[0]
        if row.get("revoked_at"):
            return None
        if not hmac.compare_digest(str(row.get("key_hash") or ""), hash_key(raw_key)):
            return None
        partner = row.get("partners") or {}
        if partner.get("status") != "active":
            return None
        return PartnerCredential(
            key_id=str(row["id"]),
            partner_id=str(row["partner_id"]),
            slug=str(partner.get("slug") or ""),
            name=str(partner.get("name") or ""),
            scopes=frozenset(row.get("scopes") or []),
        )

    def touch_key(self, key_id: str) -> None:
        """Best-effort last-used stamp — never worth failing a request over."""
        try:
            self._db.table("partner_api_keys").update(
                {"last_used_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", key_id).execute()
        except Exception as exc:  # noqa: BLE001 — telemetry, not control flow
            logger.warning("partner key touch failed key=%s: %s", key_id, exc)

    # ── provisioning (admin script / ops) ───────────────────────────────────

    def create_partner(self, *, slug: str, name: str) -> dict[str, Any]:
        resp = self._db.table("partners").insert({"slug": slug, "name": name}).execute()
        return (resp.data or [{}])[0]

    def get_partner_by_slug(self, slug: str) -> dict[str, Any] | None:
        resp = self._db.table("partners").select("*").eq("slug", slug).limit(1).execute()
        rows = resp.data or []
        return rows[0] if rows else None

    def mint_api_key(self, partner_id: str, *, scopes: list[str], label: str | None) -> str:
        """Create a key and return the RAW value. Shown once, never recoverable."""
        raw, prefix, key_hash = generate_key()
        self._db.table("partner_api_keys").insert({
            "partner_id": partner_id,
            "key_prefix": prefix,
            "key_hash": key_hash,
            "scopes": scopes,
            "label": label,
        }).execute()
        return raw

    # ── partner users ───────────────────────────────────────────────────────

    def get_link(self, partner_id: str, external_id: str) -> dict[str, Any] | None:
        resp = (
            self._db.table("partner_users")
            .select("*")
            .eq("partner_id", partner_id)
            .eq("external_id", external_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return rows[0] if rows else None

    def get_link_by_user_id(self, partner_id: str, user_id: str) -> dict[str, Any] | None:
        resp = (
            self._db.table("partner_users")
            .select("*")
            .eq("partner_id", partner_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return rows[0] if rows else None

    def upsert_link(
        self,
        *,
        partner_id: str,
        external_id: str,
        email: str,
        user_id: str | None,
        link_state: str,
        connect_token_hash: str | None = None,
        connect_token_expires_at: str | None = None,
    ) -> dict[str, Any]:
        """Create or update the seat. `link_state` is the takeover gate — a caller
        that cannot prove the email belongs to this partner's user writes
        'pending_connect', and the OWNER completes it on the consent screen."""
        now = datetime.now(timezone.utc).isoformat()
        payload: dict[str, Any] = {
            "partner_id": partner_id,
            "external_id": external_id,
            "email": email.lower().strip(),
            "user_id": user_id,
            "link_state": link_state,
            # Cleared on every write: a seat that just became linked must not keep
            # a live consent token, and a re-issued token replaces its predecessor
            # rather than leaving two valid ways into the same screen.
            "connect_token_hash": connect_token_hash,
            "connect_token_expires_at": connect_token_expires_at,
        }
        if link_state == "linked" and user_id:
            payload["linked_at"] = now
        resp = (
            self._db.table("partner_users")
            .upsert(payload, on_conflict="partner_id,external_id")
            .execute()
        )
        return (resp.data or [{}])[0]

    def get_link_by_connect_token(self, token_hash: str) -> dict[str, Any] | None:
        """Resolve a consent-screen token. Expiry is enforced by the caller so an
        expired token and an unknown one can be told apart in the response."""
        resp = (
            self._db.table("partner_users")
            .select("*, partners(slug, name, status)")
            .eq("connect_token_hash", token_hash)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return rows[0] if rows else None

    def mark_linked(self, link_id: str, *, user_id: str) -> None:
        """Consent given. The token dies with the same write that grants the link,
        so a consent screen cannot be replayed after it has been used."""
        now = datetime.now(timezone.utc).isoformat()
        self._db.table("partner_users").update({
            "user_id": user_id,
            "link_state": "linked",
            "linked_at": now,
            "connect_token_hash": None,
            "connect_token_expires_at": None,
        }).eq("id", link_id).execute()

    def touch_sso(self, link_id: str) -> None:
        try:
            self._db.table("partner_users").update(
                {"last_sso_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", link_id).execute()
        except Exception as exc:  # noqa: BLE001 — telemetry, not control flow
            logger.warning("partner sso touch failed link=%s: %s", link_id, exc)

    def linked_users(self, partner_id: str, *, limit: int = 500) -> list[dict[str, Any]]:
        """Seats that can actually receive job alerts — verified links only."""
        resp = (
            self._db.table("partner_users")
            .select("id, external_id, email, user_id")
            .eq("partner_id", partner_id)
            .eq("link_state", "linked")
            .not_.is_("user_id", "null")
            .limit(limit)
            .execute()
        )
        return resp.data or []
