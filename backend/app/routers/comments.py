from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import Principal, get_principal
from app.repositories.comments import CommentsRepository, get_token_comments_repository
from app.schemas.comments import (
    CommentCreateRequest,
    CommentListResponse,
    CommentResponse,
    CommentUpdateRequest,
    EntityType,
)

router = APIRouter(prefix="/comments", tags=["comments"])


def _to_response(row: dict) -> CommentResponse:
    return CommentResponse(
        id=row["id"],
        entity_type=row["entity_type"],
        entity_id=row["entity_id"],
        body=row["body"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("", response_model=CommentListResponse)
async def list_comments(
    entity_type: EntityType,
    entity_id: str,
    principal: Principal = Depends(get_principal),
    repo: CommentsRepository = Depends(get_token_comments_repository),
) -> CommentListResponse:
    rows = repo.list_for_entity(principal.id, entity_type, entity_id)
    comments = [_to_response(row) for row in rows]
    return CommentListResponse(comments=comments, total=len(comments))


@router.post("", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    body: CommentCreateRequest,
    principal: Principal = Depends(get_principal),
    repo: CommentsRepository = Depends(get_token_comments_repository),
) -> CommentResponse:
    row = repo.create(principal.id, body.entity_type, body.entity_id, body.body)
    if not row:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save comment")
    return _to_response(row)


@router.patch("/{comment_id}", response_model=CommentResponse)
async def update_comment(
    comment_id: str,
    body: CommentUpdateRequest,
    principal: Principal = Depends(get_principal),
    repo: CommentsRepository = Depends(get_token_comments_repository),
) -> CommentResponse:
    row = repo.update(principal.id, comment_id, body.body)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    return _to_response(row)


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: str,
    principal: Principal = Depends(get_principal),
    repo: CommentsRepository = Depends(get_token_comments_repository),
) -> None:
    if not repo.delete(principal.id, comment_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
