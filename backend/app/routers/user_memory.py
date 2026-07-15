"""User Memory router — token-scoped CRUD for the caller's own facts, plus the
persona canvas ("What Myro knows about you", Lane B).

The persistent "knows me" store. Facts are the evidence substrate; the canvas
is the primary surface — three movements of grounded prose the synthesis writer
maintains and the user can edit (edits are law: an edited paragraph is pinned
and survives every regeneration). Structured axes with profile columns
(role/location/seniority) are NOT managed here — they keep their own setters, so
there is one source per fact.
"""
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import ValidationError
from supabase import Client

from app.deps import CurrentUser, get_current_user, get_user_db
from app.repositories.user_memory import (
    UserMemoryRepository,
    get_user_memory_repository,
)
from app.schemas.user_memory import (
    AddMemoryRequest,
    MemoryFact,
    MemoryListResponse,
    PersonaEditRequest,
    PersonaParagraph,
    PersonaResponse,
    PersonaTimelineRole,
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


# ── Persona canvas ───────────────────────────────────────────────────────────

def _valid_paragraphs(raw: Any) -> list[PersonaParagraph]:
    out: list[PersonaParagraph] = []
    for item in raw if isinstance(raw, list) else []:
        try:
            out.append(PersonaParagraph(**item))
        except (ValidationError, TypeError):
            continue
    return out


def _cosmos_state(user_id: str) -> str:
    """Birth details on file? myrology_intake has no user-facing RLS policy, so
    this existence check (own id only) goes through the admin client."""
    from app.database import get_supabase_admin
    from app.db_safe import safe_read

    row = safe_read(
        get_supabase_admin().table("myrology_intake").select("user_id").eq("user_id", user_id).maybe_single(),
        default=None,
        context="persona_cosmos",
    )
    return "on_file" if row else "none"


@router.get("/persona", response_model=PersonaResponse)
def get_persona(
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_user_db),
) -> PersonaResponse:
    """The canvas + meridian timeline. Always schedules a (debounced) synthesis
    pass in the background so the document refreshes as behaviour accrues."""
    from app.services import persona_signals, persona_synthesis

    row = persona_synthesis.read_persona(db, user.id)
    paragraphs = _valid_paragraphs((row or {}).get("paragraphs"))
    background_tasks.add_task(persona_synthesis.maybe_synthesize, user.id)
    timeline = [
        PersonaTimelineRole(
            company=r["company"],
            title=r["title"],
            date_label=r["date_label"],
            started_on=str(r["started_on"]) if r.get("started_on") else None,
        )
        for r in persona_signals.collect_timeline(db, user.id)
    ]
    return PersonaResponse(
        status="ready" if paragraphs else "pending",
        paragraphs=paragraphs,
        generated_at=(row or {}).get("generated_at"),
        timeline=timeline,
        cosmos=_cosmos_state(user.id),
    )


@router.patch("/persona/paragraphs/{paragraph_id}", response_model=PersonaParagraph)
def edit_persona_paragraph(
    paragraph_id: str,
    body: PersonaEditRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_user_db),
) -> PersonaParagraph:
    """Edit a paragraph in the caller's own canvas. An edited paragraph becomes
    the user's words — pinned, authoritative, never overwritten by synthesis."""
    from app.services import persona_synthesis

    if body.text is None and body.pinned is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes supplied.")

    row = persona_synthesis.read_persona(db, user.id)
    paragraphs = list((row or {}).get("paragraphs") or [])
    target = next((p for p in paragraphs if isinstance(p, dict) and p.get("id") == paragraph_id), None)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paragraph not found.")

    if body.text is not None:
        target["text"] = body.text.strip()
        target["author"] = "user"
        target["pinned"] = True
        target["grounds"] = []  # user words carry their own authority
    if body.pinned is not None:
        target["pinned"] = body.pinned

    db.table("user_persona").update(
        {"paragraphs": paragraphs, "updated_at": "now()"}
    ).eq("user_id", user.id).execute()
    return PersonaParagraph(**target)


@router.post("/persona/refresh", status_code=status.HTTP_202_ACCEPTED)
def refresh_persona(
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, bool]:
    """Explicit re-synthesis (still gently rate-limited server-side)."""
    from app.services import persona_synthesis

    background_tasks.add_task(persona_synthesis.maybe_synthesize, user.id, True)
    return {"scheduled": True}
