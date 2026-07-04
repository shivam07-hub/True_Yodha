"""Own-connections upload (backlog #35 slice 5, ADR-0018 Path 1).

The user uploads their OWN LinkedIn connections export; Myro keeps only
name/company/position to suggest warm intros inside a reach pack. Strictly
optional — the reach pack works without it. No LLM, no coin charge.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.deps import Principal, get_principal
from app.repositories.connections import (
    ConnectionsRepository,
    get_token_connections_repository,
)
from app.services.connections_import import parse_connections_csv

router = APIRouter()

_MAX_BYTES = 8 * 1024 * 1024  # LinkedIn exports are small; cap defensively.


class ConnectionsStatus(BaseModel):
    count: int


@router.get("/connections", response_model=ConnectionsStatus)
def get_connections_status(
    principal: Principal = Depends(get_principal),
    repo: ConnectionsRepository = Depends(get_token_connections_repository),
) -> ConnectionsStatus:
    return ConnectionsStatus(count=repo.count(principal.id))


@router.post("/connections/upload", response_model=ConnectionsStatus)
async def upload_connections(
    file: UploadFile,
    principal: Principal = Depends(get_principal),
    repo: ConnectionsRepository = Depends(get_token_connections_repository),
) -> ConnectionsStatus:
    """Parse a LinkedIn Connections.csv export and replace the user's set."""
    raw = await file.read()
    if len(raw) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="That file is too large — upload your LinkedIn Connections.csv.",
        )
    rows = parse_connections_csv(raw)
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Couldn't read any connections. Upload the Connections.csv from your LinkedIn data export.",
        )
    inserted = repo.replace_all(principal.id, rows)
    return ConnectionsStatus(count=inserted)


@router.delete("/connections", response_model=ConnectionsStatus)
def clear_connections(
    principal: Principal = Depends(get_principal),
    repo: ConnectionsRepository = Depends(get_token_connections_repository),
) -> ConnectionsStatus:
    repo.clear(principal.id)
    return ConnectionsStatus(count=0)
