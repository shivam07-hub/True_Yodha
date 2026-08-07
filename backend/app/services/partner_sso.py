"""partner_sso — hand a partner's signed-in user a Myro session, safely.

The partner already authenticated the person; we do not re-ask. What we DO ask
is whether the partner is entitled to speak for that email address, because a
partner API key that can mint a sign-in link for any address is a master key to
every Myro account whose email an attacker can guess.

The gate has two outcomes, and BOTH return a url — the user is never bounced out
of the flow:

  new account, or           → `mode: direct`. A one-time sign-in url. The user
  already this partner        lands inside Myro, signed in.

  pre-existing account      → `mode: connect_required`. A url to a Myro-hosted
                              consent screen: "Finlatics wants to connect your
                              Myro account". The OWNER approves it there — one
                              click if they already have a session, a Google
                              sign-in if not. An emailed link exists only as a
                              fallback they can ask for.

What the second case must never become is "the partner said so, therefore log
them in". A partner verified THEIR user; nothing has verified that their user
owns the Myro account already sitting on that address. The consent screen is
where that gap is closed, and closing it in the flow instead of in an inbox is
the whole point of this design.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

from app.config import settings
from app.repositories.partners import PartnerCredential, PartnersRepository
from app.services import auth_links, email_service
from app.services.user_provisioning import ensure_user_provisioned

logger = logging.getLogger(__name__)

# Every Supabase sign-in link lands on ONE consumer — the frontend's
# /auth/callback, which is the only page that reads the token out of the url
# hash. A partner cannot choose the destination beyond that, and deliberately
# so: `postAuthDestination` decides where a user goes from carried intent, and
# deep-link return was deleted on purpose (2026-07-11, "a dead parameter is
# worse than a missing one"). New users land on /onboarding, returning users on
# /market — which is what a partner wants anyway.
_CALLBACK_PATH = "/auth/callback"
_CONNECT_PATH = "/connect"

# How long a consent screen stays openable. Long enough that a user who opens it
# in a background tab still finishes; short enough that a url copied out of a
# shared screen is dead by the time anyone tries it. It grants nothing on its
# own — approving still requires authenticating as the account owner.
CONNECT_TOKEN_TTL_MINUTES = 30


@dataclass(frozen=True)
class SsoOutcome:
    mode: str                     # 'direct' | 'connect_required'
    login_url: str | None
    connect_url: str | None
    user_ref: str                 # our partner_users.id — the partner's handle on this seat
    message: str


def callback_url(**params: str) -> str:
    """The sign-in landing url on OUR origin, with optional query params.

    The origin comes from configuration, never from the request or the caller,
    so no partner input can steer a sign-in link off-site.
    """
    base = f"{settings.public_app_url}{_CALLBACK_PATH}"
    query = urlencode({k: v for k, v in params.items() if v})
    return f"{base}?{query}" if query else base


def hash_connect_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _mint_connect_token() -> tuple[str, str, str]:
    """Return (raw token, sha256, expiry iso). Only the hash is stored."""
    raw = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(minutes=CONNECT_TOKEN_TTL_MINUTES)
    return raw, hash_connect_token(raw), expires.isoformat()


def start_session(
    repo: PartnersRepository,
    admin: Any,
    *,
    partner: PartnerCredential,
    external_id: str,
    email: str,
    full_name: str | None,
) -> SsoOutcome:
    """Run the binding gate. Always returns a url the partner can redirect to."""
    email = email.lower().strip()
    redirect_to = callback_url()
    existing = repo.get_link(partner.partner_id, external_id)

    # Already through the gate on a previous call — and still the same address.
    # An email CHANGE re-opens the gate: the partner may now be naming somebody
    # else's account.
    if (
        existing
        and existing.get("link_state") == "linked"
        and existing.get("user_id")
        and str(existing.get("email") or "").lower() == email
    ):
        repo.touch_sso(str(existing["id"]))
        return SsoOutcome(
            mode="direct",
            login_url=auth_links.mint_login_link(admin, email=email, redirect_to=redirect_to),
            connect_url=None,
            user_ref=str(existing["id"]),
            message="Sign-in link minted.",
        )

    created_user_id = auth_links.create_user_if_absent(admin, email)

    if created_user_id:
        # Nobody has ever used this address on Myro. Linking it now cannot take
        # anything over, because there is nothing to take.
        ensure_user_provisioned(created_user_id, email, full_name)
        link = repo.upsert_link(
            partner_id=partner.partner_id,
            external_id=external_id,
            email=email,
            user_id=created_user_id,
            link_state="linked",
        )
        logger.info("metric partner_sso.linked partner=%s mode=new_account", partner.slug)
        return SsoOutcome(
            mode="direct",
            login_url=auth_links.mint_login_link(admin, email=email, redirect_to=redirect_to),
            connect_url=None,
            user_ref=str(link.get("id") or ""),
            message="Account created and linked.",
        )

    # The address predates this call. The partner gets a consent screen, not a
    # session — and a fresh token, so an older screen for this seat goes dead.
    raw_token, token_hash, expires_at = _mint_connect_token()
    link = repo.upsert_link(
        partner_id=partner.partner_id,
        external_id=external_id,
        email=email,
        user_id=None,
        link_state="pending_connect",
        connect_token_hash=token_hash,
        connect_token_expires_at=expires_at,
    )
    logger.info("metric partner_sso.connect_required partner=%s", partner.slug)
    return SsoOutcome(
        mode="connect_required",
        login_url=None,
        connect_url=f"{settings.public_app_url}{_CONNECT_PATH}/{partner.slug}?t={raw_token}",
        user_ref=str(link.get("id") or ""),
        message="This email already has a Myro account. Send the user to connect_url to approve the connection.",
    )


# ── the consent screen ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class ConnectContext:
    """What the consent screen may show BEFORE anyone has authenticated."""

    partner_name: str
    partner_slug: str
    external_id: str
    email_masked: str


def resolve_connect_token(repo: PartnersRepository, token: str) -> ConnectContext | None:
    """Resolve a consent token for display. None = unknown, expired, or spent.

    The email is masked: whoever holds this token has not yet proved they are the
    account owner, and a token that leaked should not also leak an address.
    """
    seat = repo.get_link_by_connect_token(hash_connect_token(token))
    if not seat or seat.get("link_state") != "pending_connect":
        return None
    if _expired(seat.get("connect_token_expires_at")):
        return None
    partner = seat.get("partners") or {}
    if partner.get("status") != "active":
        return None
    return ConnectContext(
        partner_name=str(partner.get("name") or ""),
        partner_slug=str(partner.get("slug") or ""),
        external_id=str(seat.get("external_id") or ""),
        email_masked=_mask_email(str(seat.get("email") or "")),
    )


def approve_connect(
    repo: PartnersRepository, *, token: str, user_id: str, user_email: str | None
) -> bool:
    """The signed-in user approved the connection.

    Their own email must match the seat. That check is the whole security model:
    the partner named an address, and only the person who can authenticate as
    that address can turn it into a link.
    """
    seat = repo.get_link_by_connect_token(hash_connect_token(token))
    if not seat or seat.get("link_state") != "pending_connect":
        return False
    if _expired(seat.get("connect_token_expires_at")):
        return False
    if str(seat.get("email") or "").lower() != (user_email or "").lower().strip():
        logger.warning("metric partner_sso.connect_email_mismatch seat=%s", seat.get("id"))
        return False
    repo.mark_linked(str(seat["id"]), user_id=user_id)
    logger.info("metric partner_sso.linked partner=%s mode=consent", seat.get("partner_id"))
    return True


def send_connect_email(repo: PartnersRepository, admin: Any, *, token: str) -> bool:
    """Fallback the USER asks for from the consent screen: mail me a link.

    Never fires on the partner's call — only when the person in front of the
    screen chooses it, because they cannot sign in right now.
    """
    seat = repo.get_link_by_connect_token(hash_connect_token(token))
    if not seat or seat.get("link_state") != "pending_connect":
        return False
    if _expired(seat.get("connect_token_expires_at")):
        return False
    partner = seat.get("partners") or {}
    email = str(seat.get("email") or "")
    target = callback_url(
        link_partner=str(partner.get("slug") or ""),
        partner_external_id=str(seat.get("external_id") or ""),
    )
    try:
        url = auth_links.mint_login_link(admin, email=email, redirect_to=target)
        return email_service.send_email(
            to=email,
            subject=f"Connect your Myro account to {partner.get('name') or 'your partner'}",
            text=_connect_email_text(str(partner.get("name") or "your partner"), url),
        )
    except Exception as exc:  # noqa: BLE001 — the screen still offers sign-in
        logger.warning("partner connect email failed seat=%s: %s", seat.get("id"), exc)
        return False


def complete_link(
    repo: PartnersRepository,
    *,
    partner_slug: str,
    external_id: str,
    user_id: str,
    user_email: str | None,
) -> bool:
    """Finish a pending link after the owner signed in via the emailed fallback
    or the consent screen's Google button. Called from post-signin.

    Same rule as `approve_connect`: the signed-in email must match the seat.
    """
    partner = repo.get_partner_by_slug(partner_slug)
    if not partner:
        return False
    link = repo.get_link(str(partner["id"]), external_id)
    if not link or link.get("link_state") != "pending_connect":
        return False
    if str(link.get("email") or "").lower() != (user_email or "").lower().strip():
        logger.warning("metric partner_sso.link_email_mismatch partner=%s", partner_slug)
        return False
    repo.mark_linked(str(link["id"]), user_id=user_id)
    logger.info("metric partner_sso.linked partner=%s mode=signed_in", partner_slug)
    return True


def _expired(raw: Any) -> bool:
    if not raw:
        return True
    try:
        expires = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return True
    return datetime.now(timezone.utc) >= expires


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not domain:
        return "•••"
    head = local[:1] or "•"
    return f"{head}{'•' * max(len(local) - 1, 1)}@{domain}"


def _connect_email_text(partner_name: str, url: str) -> str:
    return (
        f"{partner_name} would like to connect your Myro account\n\n"
        f"You already have a Myro account with this email. Sign in with the link "
        f"below and your {partner_name} profile will be connected.\n\n"
        f"{url}\n\n"
        "Didn't expect this? Ignore this email — nothing is connected until you "
        "sign in.\n\n— Myro"
    )
