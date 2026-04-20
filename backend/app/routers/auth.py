from fastapi import APIRouter, HTTPException, status

from app.database import get_supabase, get_supabase_admin
from app.schemas import AuthResponse, LoginRequest, SignupRequest

router = APIRouter(prefix="/auth", tags=["auth"])


def _upsert_user_profile(user_id: str, email: str | None, full_name: str | None) -> None:
    if not email:
        return
    get_supabase_admin().table("user_profiles").upsert(
        {
            "id": user_id,
            "email": email,
            "full_name": full_name,
        },
        on_conflict="id",
    ).execute()


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest) -> AuthResponse:
    try:
        response = get_supabase().auth.sign_up({
            "email": body.email,
            "password": body.password,
            "options": {"data": {"full_name": body.full_name}},
        })
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not response.user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Signup failed. Please try again.",
        )

    if not response.session:
        # Email confirmation required — auth.users row not yet confirmed.
        # Profile will be created on first login after confirmation.
        return AuthResponse(
            user_id=response.user.id,
            email=response.user.email,
            requires_email_confirmation=True,
            message="Check your email for a confirmation link, then sign in.",
        )

    try:
        _upsert_user_profile(response.user.id, response.user.email, body.full_name)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return AuthResponse(
        access_token=response.session.access_token,
        user_id=response.user.id,
        email=response.user.email,
    )


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest) -> AuthResponse:
    try:
        response = get_supabase().auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    if not response.user or not response.session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    _upsert_user_profile(
        response.user.id,
        response.user.email,
        response.user.user_metadata.get("full_name") if response.user.user_metadata else None,
    )
    return AuthResponse(
        access_token=response.session.access_token,
        user_id=response.user.id,
        email=response.user.email,
    )
