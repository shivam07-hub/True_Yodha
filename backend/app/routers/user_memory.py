"""User Memory router (Phase 1) — token-scoped CRUD for the caller's own facts.

The persistent "knows me" store. Authored write path only in Phase 1; Phase 2
adds distilled facts server-side. Structured axes with profile columns
(role/location/seniority) are NOT managed here — they keep their own setters, so
there is one source per fact.
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.deps import CurrentUser, get_current_user
from app.repositories.user_memory import (
    UserMemoryRepository,
    get_user_memory_repository,
)
from app.schemas.user_memory import (
    AddMemoryRequest,
    MemoryFact,
    MemoryListResponse,
    UpdateMemoryRequest,
)

router = APIRouter(prefix="/memory", tags=["memory"])


@router.get("", response_model=MemoryListResponse)
def list_memory(
    user: CurrentUser = Depends(get_current_user),
    repo: UserMemoryRepository = Depends(get_user_memory_repository),
) -> MemoryListResponse:
    """All active memory facts for the caller, newest first."""
    return MemoryListResponse(facts=[MemoryFact(**row) for row in repo.list_active(user.id)])


@router.post("", response_model=MemoryFact, status_code=status.HTTP_201_CREATED)
def add_memory(
    body: AddMemoryRequest,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
    repo: UserMemoryRepository = Depends(get_user_memory_repository),
) -> MemoryFact:
    """Add an authored memory fact (the user's own words)."""
    text = body.text.strip()
    row = repo.add(user.id, kind=body.kind, text=text, resolved=body.resolved)
    # Phase-4 semantic recall: embed off the response path (best-effort).
    if row.get("id"):
        from app.services import memory_semantic

        background_tasks.add_task(memory_semantic.embed_and_store_sync, user.id, str(row["id"]), text)
    return MemoryFact(**row)


@router.patch("/{memory_id}", response_model=MemoryFact)
def update_memory(
    memory_id: str,
    body: UpdateMemoryRequest,
    user: CurrentUser = Depends(get_current_user),
    repo: UserMemoryRepository = Depends(get_user_memory_repository),
) -> MemoryFact:
    """Edit the text or dismiss a fact (own-only)."""
    updates = {k: v for k, v in {"text": body.text, "status": body.status}.items() if v is not None}
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes supplied.")
    row = repo.update(user.id, memory_id, updates)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory fact not found.")
    return MemoryFact(**row)


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_memory(
    memory_id: str,
    user: CurrentUser = Depends(get_current_user),
    repo: UserMemoryRepository = Depends(get_user_memory_repository),
) -> None:
    repo.delete(user.id, memory_id)
