"""The consent screen's API — /partner-connect/*.

Deliberately NOT under `/partner/v1`: nothing here is called by a partner. These
three routes serve the person in front of the screen, and the only credential
that matters is their own Myro session.

  GET  /context   anonymous — what to render ("Finlatics wants to connect a•••@…")
  POST /approve   authed — the signed-in owner approves. The one that links.
  POST /email     anonymous — "email me a link instead", for someone who cannot
                  sign in right now.

The token names a seat. It grants nothing: approving still requires being signed
in as the address the partner named, which is the same check the emailed link
enforces. So the anonymous routes are safe, and they are rate-limited per IP
anyway so a stolen token cannot be used to farm masked addresses.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.repositories.partners import PartnersRepository
from app.schemas.partner import (
    ConnectApproveRequest,
    ConnectApproveResponse,
    ConnectContextResponse,
    ConnectEmailResponse,
)
from app.security.anon_rate_limit import enforce_anon_rate
from app.security.auth_rate_limit import client_ip_from_scope
from app.services import partner_sso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/partner-connect", tags=["partner"])

_INVALID = "This connection link has expired or was already used. Ask your partner to send you back to Myro."


@router.get("/context", response_model=ConnectContextResponse)
def connect_context(
    request: Request,
    t: str = Query(min_length=8, max_length=128, description="Consent token from connect_url."),
) -> ConnectContextResponse:
    enforce_anon_rate("partner_connect_context", client_ip_from_scope(request.scope))
    context = partner_sso.resolve_connect_token(PartnersRepository(get_supabase_admin()), t)
    if context is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_INVALID)
    return ConnectContextResponse(
        partner_name=context.partner_name,
        partner_slug=context.partner_slug,
        external_id=context.external_id,
        email_masked=context.email_masked,
    )


@router.post("/approve", response_model=ConnectApproveResponse)
def approve(
    body: ConnectApproveRequest,
    principal: Principal = Depends(get_principal),
) -> ConnectApproveResponse:
    """The signed-in owner says yes. One click, no inbox.

    `get_principal` validates a real Myro session; `approve_connect` then checks
    that session's email against the seat. Both are required — a session proves
    who the caller is, not that they are the person the partner named.
    """
    linked = partner_sso.approve_connect(
        PartnersRepository(get_supabase_admin()),
        token=body.token,
        user_id=principal.id,
        user_email=principal.email,
    )
    if not linked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This connection is for a different Myro account. Sign in with the "
                "email your partner has on file, then try again."
            ),
        )
    return ConnectApproveResponse(linked=True, message="Connected.")


@router.post("/email", response_model=ConnectEmailResponse)
def email_link(
    request: Request,
    body: ConnectApproveRequest,
) -> ConnectEmailResponse:
    """Fallback the USER chooses when they can't sign in here and now.

    Response shape never varies with whether the token was good — a bad token
    must not become a way to probe which seats exist.
    """
    enforce_anon_rate("partner_connect_email", client_ip_from_scope(request.scope))
    admin = get_supabase_admin()
    partner_sso.send_connect_email(PartnersRepository(admin), admin, token=body.token)
    return ConnectEmailResponse(
        sent=True,
        message="If that connection is still open, a sign-in link is on its way.",
    )
