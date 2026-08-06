"""The Partner API — Myro's B2B distribution surface (`/partner/v1/*`).

Authenticated by a partner API key, never a user token. Every route resolves its
tenant from the key and filters by `partner_id`; there is no route here that a
partner can point at another partner's data.

Versioned in the path from the first release. A partner's integration is code we
do not control, so a breaking change has to be a new version, not a deploy.
"""
from fastapi import APIRouter

from .jobs import router as jobs_router
from .sso import router as sso_router
from .webhooks import router as webhooks_router

router = APIRouter(prefix="/partner/v1", tags=["partner"])

router.include_router(sso_router)
router.include_router(webhooks_router)
router.include_router(jobs_router)
