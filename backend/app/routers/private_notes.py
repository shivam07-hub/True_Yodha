from fastapi import APIRouter, Depends

from app.deps import CurrentUser, get_current_user
from app.repositories.private_notes import (
    PrivateNotesRepository,
    get_private_notes_repository,
)
from app.schemas.private_notes import (
    PrivateEntityType,
    PrivateNoteResponse,
    PrivateNoteUpsertRequest,
)

router = APIRouter(prefix="/private-notes", tags=["private-notes"])


@router.get("", response_model=PrivateNoteResponse)
def get_note(
    entity_type: PrivateEntityType,
    entity_id: str,
    user: CurrentUser = Depends(get_current_user),
    repo: PrivateNotesRepository = Depends(get_private_notes_repository),
) -> PrivateNoteResponse:
    """The caller's own note for this entity, or a null body if none yet."""
    row = repo.get(user.id, entity_type, entity_id)
    return PrivateNoteResponse(
        entity_type=entity_type,
        entity_id=entity_id,
        body=row.get("body") if row else None,
        updated_at=row.get("updated_at") if row else None,
    )


@router.put("", response_model=PrivateNoteResponse)
def put_note(
    body: PrivateNoteUpsertRequest,
    user: CurrentUser = Depends(get_current_user),
    repo: PrivateNotesRepository = Depends(get_private_notes_repository),
) -> PrivateNoteResponse:
    """Upsert the single living private note for this entity (own-only)."""
    row = repo.upsert(user.id, body.entity_type, body.entity_id, body.body)
    return PrivateNoteResponse(
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        body=row.get("body"),
        updated_at=row.get("updated_at"),
    )
