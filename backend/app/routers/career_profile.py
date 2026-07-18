"""Career Profile router — token-scoped read/write of the caller's recruiter
fact-layer, plus the prose write-through to user_memory.

GET returns the stored profile (+ updated_at). PATCH merges supplied keys
(absent keys untouched; explicit null clears a key), then rebuilds the
user_memory prose mirror and embeds the new rows off the response path so
persona/recall stay current. The Myro extension reads GET to background-cache
the profile for ATS auto-fill (P2).
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import ValidationError

from app.deps import CurrentUser, get_current_user
from app.repositories.career_profile import (
    CareerProfileRepository,
    get_career_profile_repository,
)
from app.schemas.career_profile import (
    CareerProfile,
    CareerProfileResponse,
    UpdateCareerProfileRequest,
)

router = APIRouter(prefix="/career-profile", tags=["career-profile"])


def _embed_rows(user_id: str, rows: list[dict]) -> None:
    """Embed the freshly-written prose mirror rows (Phase-4 semantic recall)."""
    from app.services import memory_semantic

    for row in rows:
        rid, text = row.get("id"), row.get("text")
        if rid and text:
            memory_semantic.embed_and_store_sync(user_id, str(rid), text)


@router.get("", response_model=CareerProfileResponse)
def get_career_profile(
    user: CurrentUser = Depends(get_current_user),
    repo: CareerProfileRepository = Depends(get_career_profile_repository),
) -> CareerProfileResponse:
    """The caller's stored career profile. `suggested` (reservoir-derived
    pre-fill) is populated by S2 when the mini-form ships."""
    data, updated_at = repo.get(user.id)
    return CareerProfileResponse(
        profile=CareerProfile(**data),
        updated_at=str(updated_at) if updated_at else None,
        suggested=None,
    )


@router.patch("", response_model=CareerProfileResponse)
def update_career_profile(
    body: UpdateCareerProfileRequest,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
    repo: CareerProfileRepository = Depends(get_career_profile_repository),
) -> CareerProfileResponse:
    """Merge supplied keys, validate against the typed contract, rebuild the
    prose mirror. Unknown keys are ignored (schema extra=ignore); values are
    range-validated by CareerProfile."""
    # Validate the merged result through the typed contract, then persist the
    # clean dict (drops unknown keys, coerces types).
    current, _ = repo.get(user.id)
    merged_raw = {**current}
    for key, value in body.profile.items():
        if value is None:
            merged_raw.pop(key, None)
        else:
            merged_raw[key] = value
    try:
        clean = CareerProfile(**merged_raw).model_dump(exclude_none=True)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc

    repo.write(user.id, clean)
    inserted = repo.rebuild_prose_mirror(user.id, clean)
    if inserted:
        background_tasks.add_task(_embed_rows, user.id, inserted)

    data, updated_at = repo.get(user.id)
    return CareerProfileResponse(
        profile=CareerProfile(**data),
        updated_at=str(updated_at) if updated_at else None,
    )
