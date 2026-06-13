from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.repositories.growth import (
    GrowthRecordNotFoundError,
    GrowthRepository,
    get_growth_repository,
)
from app.schemas.growth import (
    GrowthBootstrapResponse,
    GrowthMessage,
    GrowthMessageUpdate,
    GrowthMetricUpdate,
    GrowthOperator,
    GrowthPublication,
    LegacyGrowthImport,
    LegacyGrowthImportResult,
    PublicationCreate,
)

router = APIRouter(prefix="/growth", tags=["growth"])


def get_growth_operator(
    principal: Principal = Depends(get_principal),
    db: Client = Depends(get_supabase_admin),
) -> GrowthOperator:
    result = (
        db.table("growth_operators")
        .select("user_id,role,display_name,active")
        .eq("user_id", principal.id)
        .limit(1)
        .execute()
    )
    rows = _rows(result)
    if not rows or not rows[0].get("active"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Growth Command access is not enabled for this account.",
        )
    return GrowthOperator.model_validate(rows[0])


@router.get("/bootstrap", response_model=GrowthBootstrapResponse)
def bootstrap(
    operator: GrowthOperator = Depends(get_growth_operator),
    repo: GrowthRepository = Depends(get_growth_repository),
) -> dict[str, object]:
    return {"operator": operator, **repo.list_command_center()}


@router.patch("/messages/{message_id}", response_model=GrowthMessage)
def update_message(
    message_id: str,
    body: GrowthMessageUpdate,
    _operator: GrowthOperator = Depends(get_growth_operator),
    repo: GrowthRepository = Depends(get_growth_repository),
) -> dict[str, Any]:
    try:
        return repo.update_message(message_id, body)
    except GrowthRecordNotFoundError as exc:
        raise _not_found() from exc


@router.post("/messages/{message_id}/approve", response_model=GrowthMessage)
def approve_message(
    message_id: str,
    operator: GrowthOperator = Depends(get_growth_operator),
    repo: GrowthRepository = Depends(get_growth_repository),
) -> dict[str, Any]:
    try:
        return repo.approve_message(message_id, operator.user_id)
    except GrowthRecordNotFoundError as exc:
        raise _not_found() from exc


@router.post(
    "/messages/{message_id}/publish",
    response_model=GrowthPublication,
    status_code=status.HTTP_201_CREATED,
)
def mark_published(
    message_id: str,
    body: PublicationCreate,
    operator: GrowthOperator = Depends(get_growth_operator),
    repo: GrowthRepository = Depends(get_growth_repository),
) -> dict[str, Any]:
    try:
        return repo.mark_published(message_id, body, operator.user_id)
    except GrowthRecordNotFoundError as exc:
        raise _not_found() from exc


@router.patch(
    "/publications/{publication_id}/metrics",
    response_model=GrowthPublication,
)
def update_publication_metrics(
    publication_id: str,
    body: GrowthMetricUpdate,
    _operator: GrowthOperator = Depends(get_growth_operator),
    repo: GrowthRepository = Depends(get_growth_repository),
) -> dict[str, Any]:
    try:
        return repo.update_publication_metrics(publication_id, body)
    except GrowthRecordNotFoundError as exc:
        raise _not_found() from exc


@router.post("/import/legacy", response_model=LegacyGrowthImportResult)
def import_legacy(
    body: LegacyGrowthImport,
    _operator: GrowthOperator = Depends(get_growth_operator),
    repo: GrowthRepository = Depends(get_growth_repository),
) -> LegacyGrowthImportResult:
    return repo.import_legacy(body)


def _rows(result: Any) -> list[dict[str, Any]]:
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    return []


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Growth record not found.",
    )
