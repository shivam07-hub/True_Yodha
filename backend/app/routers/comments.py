from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import Principal, get_principal, get_principal_optional
from app.repositories.comments import (
    CommentsRepository,
    PublicCommentsRepository,
    get_public_comments_repository,
    get_token_comments_repository,
)
from app.schemas.comments import (
    CommentCreateRequest,
    CommentFlagResponse,
    CommentListResponse,
    CommentResponse,
    CommentUpdateRequest,
    EntityType,
)

router = APIRouter(prefix="/comments", tags=["comments"])


def _to_response(
    row: dict,
    *,
    author_ninja_name: str | None = None,
    is_own: bool = False,
) -> CommentResponse:
    return CommentResponse(
        id=row["id"],
        entity_type=row["entity_type"],
        entity_id=row["entity_id"],
        body=row["body"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        author_ninja_name=author_ninja_name,
        is_own=is_own,
    )


@router.get("", response_model=CommentListResponse)
def list_comments(
    entity_type: EntityType,
    entity_id: str,
    principal: Principal | None = Depends(get_principal_optional),
    public: PublicCommentsRepository = Depends(get_public_comments_repository),
) -> CommentListResponse:
    """Public note feed for an entity. Anonymous-readable. Returns every visible
    note newest-first with the author's ninja_name; user_id is never exposed."""
    rows = public.list_visible(entity_type, entity_id)
    names = public.ninja_names_for([r["user_id"] for r in rows])
    viewer_id = principal.id if principal else None
    comments = [
        _to_response(
            row,
            author_ninja_name=names.get(row["user_id"]),
            is_own=bool(viewer_id) and row["user_id"] == viewer_id,
        )
        for row in rows
    ]
    return CommentListResponse(comments=comments, total=len(comments))


@router.post("", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
def create_comment(
    body: CommentCreateRequest,
    principal: Principal = Depends(get_principal),
    repo: CommentsRepository = Depends(get_token_comments_repository),
    public: PublicCommentsRepository = Depends(get_public_comments_repository),
) -> CommentResponse:
    # Multi-note is allowed (no per-entity uniqueness); the only guard is the
    # per-user daily cap to keep the public feed spam-resistant.
    if public.over_daily_limit(principal.id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily note limit reached. Try again tomorrow.",
        )
    row = repo.create(principal.id, body.entity_type, body.entity_id, body.body)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save note"
        )
    ninja = public.ninja_names_for([principal.id]).get(principal.id)
    return _to_response(row, author_ninja_name=ninja, is_own=True)


@router.patch("/{comment_id}", response_model=CommentResponse)
def update_comment(
    comment_id: str,
    body: CommentUpdateRequest,
    principal: Principal = Depends(get_principal),
    repo: CommentsRepository = Depends(get_token_comments_repository),
    public: PublicCommentsRepository = Depends(get_public_comments_repository),
) -> CommentResponse:
    row = repo.update(principal.id, comment_id, body.body)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    ninja = public.ninja_names_for([principal.id]).get(principal.id)
    return _to_response(row, author_ninja_name=ninja, is_own=True)


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: str,
    principal: Principal = Depends(get_principal),
    repo: CommentsRepository = Depends(get_token_comments_repository),
) -> None:
    if not repo.delete(principal.id, comment_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")


@router.post("/{comment_id}/flag", response_model=CommentFlagResponse)
def flag_comment(
    comment_id: str,
    principal: Principal = Depends(get_principal),
    public: PublicCommentsRepository = Depends(get_public_comments_repository),
) -> CommentFlagResponse:
    """Community flag. One flag per user per note (deduped). At the threshold a
    DB trigger flips status -> hidden, dropping it from the public feed."""
    if not public.get_visible(comment_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    result = public.record_flag(comment_id, principal.id)
    return CommentFlagResponse(
        comment_id=comment_id,
        report_count=result["report_count"],
        status=result["status"],
    )
