"""partner_sso — hand a partner's signed-in user a Myro session, safely.

The partner already authenticated the person; we do not re-ask. What we DO ask
is whether the partner is entitled to speak for that email address, because a
partner API key that can mint a sign-in link for any address is a master key to
every Myro account whose email an attacker can guess.

The gate has exactly three outcomes:

  new account          → we created it on this call, nobody else has ever used
                         it, so the seat is linked and the link is returned.
  already this partner → the seat was linked in an earlier call that passed the
                         gate; the link is returned.
  pre-existing account → the address belongs to a Myro user this partner has
                         never been tied to. NO url goes back to the partner.
                         We email the owner a sign-in link instead, and the seat
                         stays 'pending_verification' until that person signs in
                         and `complete_link` confirms the address is theirs.

The third case is the whole point. It is also the case a partner will hit for
any of their users who already signed up to Myro directly.
"""
from __future__ import annotations

import logging
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

# Don't re-send a verification email to the same seat inside this window.
VERIFICATION_RESEND_MINUTES = 15


@dataclass(frozen=True)
class SsoOutcome:
    mode: str                     # 'direct' | 'verification_required'
    login_url: str | None
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


def start_session(
    repo: PartnersRepository,
    admin: Any,
    *,
    partner: PartnerCredential,
    external_id: str,
    email: str,
    full_name: str | None,
) -> SsoOutcome:
    """Run the binding gate and return either a sign-in url or a verification."""
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
        logger.info(
            "metric partner_sso.linked partner=%s mode=new_account", partner.slug
        )
        return SsoOutcome(
            mode="direct",
            login_url=auth_links.mint_login_link(admin, email=email, redirect_to=redirect_to),
            user_ref=str(link.get("id") or ""),
            message="Account created and linked.",
        )

    # The address predates this call. The partner gets no url.
    link = repo.upsert_link(
        partner_id=partner.partner_id,
        external_id=external_id,
        email=email,
        user_id=None,
        link_state="pending_verification",
    )
    _send_verification(
        admin, repo, partner=partner, link=link, email=email, previous=existing
    )
    logger.info(
        "metric partner_sso.verification_required partner=%s", partner.slug
    )
    return SsoOutcome(
        mode="verification_required",
        login_url=None,
        user_ref=str(link.get("id") or ""),
        message=(
            "This email already has a Myro account. We've emailed the owner a "
            "sign-in link to connect it — no action needed from you."
        ),
    )


def _send_verification(
    admin: Any,
    repo: PartnersRepository,
    *,
    partner: PartnerCredential,
    link: dict[str, Any],
    email: str,
    previous: dict[str, Any] | None,
) -> None:
    """Email the ACCOUNT OWNER a sign-in link that completes the partner link.

    Throttled per seat: a partner syncing their roster nightly must not mail the
    same person nightly.
    """
    if _recently_sent(previous):
        return
    target = callback_url(
        link_partner=partner.slug,
        partner_external_id=str(link.get("external_id") or ""),
    )
    try:
        url = auth_links.mint_login_link(admin, email=email, redirect_to=target)
        sent = email_service.send_email(
            to=email,
            subject=f"Connect your Myro account to {partner.name}",
            text=_verification_text(partner.name, url),
        )
        if sent:
            repo.touch_sso(str(link.get("id") or ""))
    except Exception as exc:  # noqa: BLE001 — the partner's call still succeeds
        logger.warning("partner_sso verification email failed partner=%s: %s", partner.slug, exc)


def _recently_sent(previous: dict[str, Any] | None) -> bool:
    if not previous or previous.get("link_state") != "pending_verification":
        return False
    raw = previous.get("last_sso_at")
    if not raw:
        return False
    try:
        sent_at = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return False
    return datetime.now(timezone.utc) - sent_at < timedelta(minutes=VERIFICATION_RESEND_MINUTES)


def _verification_text(partner_name: str, url: str) -> str:
    return (
        f"{partner_name} would like to connect your Myro account\n\n"
        f"You already have a Myro account with this email. Sign in with the link "
        f"below and your {partner_name} profile will be connected.\n\n"
        f"{url}\n\n"
        "Didn't expect this? Ignore this email — nothing is connected until you "
        "sign in.\n\n— Myro"
    )


def complete_link(
    repo: PartnersRepository,
    *,
    partner_slug: str,
    external_id: str,
    user_id: str,
    user_email: str | None,
) -> bool:
    """Finish a pending link after the OWNER signed in. Called from post-signin.

    The signed-in user's own email must match the seat. That check is what makes
    the whole flow safe: the partner named an address, and only the person who
    can read mail at that address can turn it into a link.
    """
    partner = repo.get_partner_by_slug(partner_slug)
    if not partner:
        return False
    link = repo.get_link(str(partner["id"]), external_id)
    if not link or link.get("link_state") != "pending_verification":
        return False
    if str(link.get("email") or "").lower() != (user_email or "").lower().strip():
        logger.warning(
            "metric partner_sso.link_email_mismatch partner=%s", partner_slug
        )
        return False
    repo.mark_linked(str(link["id"]), user_id=user_id)
    logger.info("metric partner_sso.linked partner=%s mode=verified", partner_slug)
    return True
