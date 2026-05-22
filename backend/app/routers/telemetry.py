from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.database import get_supabase_admin
from app.deps import Principal, get_principal

router = APIRouter(prefix="/v1/telemetry", tags=["telemetry"])


class RoutePerfPayload(BaseModel):
    route: str
    ttfa_ms: int
    tti_cc_ms: int | None = None
    cls: float | None = None
    deploy_id: str | None = None
    backend_version: str | None = None
    viewport: str | None = None
    session_id: str | None = None


@router.post("/route-perf", status_code=201)
async def record_route_perf(
    payload: RoutePerfPayload,
    principal: Principal = Depends(get_principal),
) -> dict:
    get_supabase_admin().table("route_perf_events").insert({
        "user_id": principal.id,
        "route": payload.route,
        "ttfa_ms": payload.ttfa_ms,
        "tti_cc_ms": payload.tti_cc_ms,
        "cls": payload.cls,
        "deploy_id": payload.deploy_id,
        "backend_version": payload.backend_version,
        "viewport": payload.viewport,
        "session_id": payload.session_id,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return {"ok": True}
