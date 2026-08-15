"""The brain-dump notebook (User Memory Phase 3) — POST/GET/DELETE /cv/dump.

A persistent place for the user to free-write, over time, what they've done and
what they want (the successor to the retired diary). Entries feed two consumers
downstream: Phase-2 distillation (durable facts) and cv_intake (JD-aligned
bullets). This router just owns the durable notebook; the refinement flows live
in their own endpoints. Own-only via CurrentUser + RLS.
"""
from fastapi import APIRouter, BackgroundTasks, Depends, status

from app.deps import CurrentUser, get_current_user
from app.repositories.cv_dump import CvDumpRepository, get_cv_dump_repository
from app.schemas.cv_dump import AddDumpRequest, DumpEntry, DumpListResponse

router = APIRouter()


@router.get("/dump", response_model=DumpListResponse)
def list_dump(
    user: CurrentUser = Depends(get_current_user),
    repo: CvDumpRepository = Depends(get_cv_dump_repository),
) -> DumpListResponse:
    """The caller's recent brain-dump entries, newest first."""
    return DumpListResponse(entries=[DumpEntry(**row) for row in repo.list_recent(user.id)])


@router.post("/dump", response_model=DumpEntry, status_code=status.HTTP_201_CREATED)
def add_dump(
    body: AddDumpRequest,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
    repo: CvDumpRepository = Depends(get_cv_dump_repository),
) -> DumpEntry:
    """Append one brain-dump entry (the user's own words), and take away what it
    says about them.

    The entry has always fed the batch distiller eventually. Eventually was doing
    a lot of work: that runs on `/home`, debounced 12h, and gated on three
    BEHAVIOURAL signals with facts excluded from the count — so someone who
    writes here and clicks nothing qualified for nothing. Off the response path;
    the entry is already saved above and losing a fact is survivable where losing
    their words is not."""
    from app.services import mentor_learn

    entry = repo.add(user.id, body.text.strip(), body.source)
    background_tasks.add_task(mentor_learn.learn_from_turn, user.id, body.text, "notebook")
    return DumpEntry(**entry)


@router.delete("/dump/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dump(
    entry_id: str,
    user: CurrentUser = Depends(get_current_user),
    repo: CvDumpRepository = Depends(get_cv_dump_repository),
) -> None:
    repo.delete(user.id, entry_id)
