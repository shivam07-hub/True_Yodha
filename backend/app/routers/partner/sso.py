"""POST /partner/v1/sso/session — a partner hands us one of their signed-in users.

The partner's server calls this with their user's email; we return a url for
that user's BROWSER. No password, no second signup, no shared session between
partners.

Two shapes, one behaviour for the caller: redirect to whichever url came back.
`login_url` lands the user inside Myro; `connect_url` lands them on the consent
screen because the address already has a Myro account. The gate that decides
which lives in `services/partner_sso` — read that docstring before changing
anything here.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.database import get_supabase_admin
from app.repositories.partners import PartnerCredential, PartnersRepository
from app.schemas.partner import SsoSessionRequest, SsoSessionResponse
from app.security.partner_auth import SCOPE_SSO, require_scope
from app.services import partner_sso

router = APIRouter()


@router.post("/sso/session", response_model=SsoSessionResponse)
def create_sso_session(
    body: SsoSessionRequest,
    partner: PartnerCredential = Depends(require_scope(SCOPE_SSO)),
) -> SsoSessionResponse:
    admin = get_supabase_admin()
    outcome = partner_sso.start_session(
        PartnersRepository(admin),
        admin,
        partner=partner,
        external_id=body.external_id.strip(),
        email=str(body.email),
        full_name=body.full_name,
    )
    return SsoSessionResponse(
        mode=outcome.mode,
        login_url=outcome.login_url,
        connect_url=outcome.connect_url,
        user_ref=outcome.user_ref,
        message=outcome.message,
    )
