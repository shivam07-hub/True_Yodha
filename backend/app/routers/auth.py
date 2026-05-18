from fastapi import APIRouter, Cookie, HTTPException, status

from app.database import get_supabase
from app.schemas import AuthResponse, LoginRequest, RefreshRequest, RefreshResponse, SignupRequest
from app.services.user_provisioning import ensure_user_provisioned

router = APIRouter(prefix="/auth", tags=["auth"])

_REF_COOKIE = "myro_ref"


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    body: SignupRequest,
    myro_ref: str | None = Cookie(default=None, alias=_REF_COOKIE),
) -> AuthResponse:
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
        # Profile (and ninja_name) created on first authenticated request.
        return AuthResponse(
            user_id=response.user.id,
            email=response.user.email,
            requires_email_confirmation=True,
            message="Check your email for a confirmation link, then sign in.",
        )

    # Body field wins (cross-origin CORS strips cookies); cookie is the fallback.
    referrer = body.myro_ref or myro_ref
    try:
        ensure_user_provisioned(
            response.user.id,
            response.user.email,
            body.full_name,
            myro_ref=referrer,
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return AuthResponse(
        access_token=response.session.access_token,
        refresh_token=response.session.refresh_token,
        user_id=response.user.id,
        email=response.user.email,
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    body: LoginRequest,
    myro_ref: str | None = Cookie(default=None, alias=_REF_COOKIE),
) -> AuthResponse:
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

    ensure_user_provisioned(
        response.user.id,
        response.user.email,
        response.user.user_metadata.get("full_name") if response.user.user_metadata else None,
        myro_ref=myro_ref,
    )
    return AuthResponse(
        access_token=response.session.access_token,
        refresh_token=response.session.refresh_token,
        user_id=response.user.id,
        email=response.user.email,
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_token(body: RefreshRequest) -> RefreshResponse:
    try:
        response = get_supabase().auth.refresh_session(body.refresh_token)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    if not response.session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token refresh failed")

    return RefreshResponse(
        access_token=response.session.access_token,
        refresh_token=response.session.refresh_token,
    )
