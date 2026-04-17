from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_supabase_for_token
from app.deps import get_current_user
from app.schemas import UpdateProfileRequest, UserProfileResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserProfileResponse)
async def get_me(current_user: dict = Depends(get_current_user)) -> UserProfileResponse:
    result = (
        get_supabase_for_token(current_user["token"])
        .table("user_profiles")
        .select("*")
        .eq("id", current_user["user_id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    return UserProfileResponse(**result.data)


@router.put("/me/profile", response_model=UserProfileResponse)
async def update_profile(
    body: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
) -> UserProfileResponse:
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update.")

    db = get_supabase_for_token(current_user["token"])
    db.table("user_profiles").update(updates).eq("id", current_user["user_id"]).execute()
    result = (
        db.table("user_profiles")
        .select("*")
        .eq("id", current_user["user_id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    return UserProfileResponse(**result.data)
