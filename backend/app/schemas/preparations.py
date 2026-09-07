from __future__ import annotations

from pydantic import BaseModel, Field


class LevelRow(BaseModel):
    """One level this job tests. `has_drill` False = /practice cannot serve it."""

    name: str
    held: int
    required: int
    has_drill: bool


class StepProgress(BaseModel):
    """A step's own count, stated by its card head ("9/9 · clear")."""

    answered: int = 0
    total: int = 0


class LadderRoom(BaseModel):
    """One live prep room's position on the four-step ladder.

    No role or company: `/preparations` already holds the applications list and
    joins on `job_id`.
    """

    job_id: str
    #: Four entries, in step order: evidence, level, rehearsal, brief.
    #: 0 not started · 1 started · 2 clear.
    steps: list[int]
    #: `sum(steps) / 8` as 0-100 — the rail's number and the room's ring.
    pct: int
    #: 1-based number of the first step not yet clear.
    current_step: int
    #: Step 2's detail rows. Carried here rather than fetched per open room:
    #: the ladder already resolved `job_skills` for the whole board, so a second
    #: endpoint would re-read what this one has in hand.
    levels: list[LevelRow] = Field(default_factory=list)
    #: Step 1's count: requirements answered, of requirements this job states.
    #: `answered` excludes weak matches, exactly as `evidence_step` does, so the
    #: head's number and its pip can never tell different stories.
    evidence: StepProgress = Field(default_factory=StepProgress)
    #: Step 3's count: stories worked, of stories this room's questions need.
    rehearsal: StepProgress = Field(default_factory=StepProgress)


class LadderTotals(BaseModel):
    """Where the whole board stalls — the cross-room footer line."""

    step_pct: list[int]
    bottleneck_step: int
    rooms: int


class TrainingMatch(BaseModel):
    """One Finlatics card in the rail.

    `program_id` indexes the catalogue in `frontend/lib/finlatics-programs.ts`,
    which owns the title, blurb and outbound URL. This carries only the claim.
    """

    program_id: str
    #: "Covers KPI governance · the L3 ask in 7 of your rooms". None when this
    #: programme answers nothing on the board — the card renders without a claim.
    why: str | None = None
    matched: bool = False


class RehearsalState(BaseModel):
    """Step 3's record for ONE room, drawn from the user's rehearsed stories.

    `rehearsed` holds story ids, not requirement text: a story rehearsed for
    any room counts in every room that leans on it. `answered`/`total` are
    recomputed on every read against this room's current questions, so a
    re-parsed JD moves them honestly.
    """

    rehearsed: list[str] = Field(default_factory=list)
    answered: int
    total: int


class RehearsalUpdate(BaseModel):
    """One story, marked or cleared.

    Not a whole set: the record is user-level now, and a "replace the set"
    write from one room would silently clear stories rehearsed for rooms the
    client cannot see.
    """

    story_id: str = Field(min_length=1, max_length=64)
    rehearsed: bool


class PrepLadderResponse(BaseModel):
    rooms: list[LadderRoom] = Field(default_factory=list)
    totals: LadderTotals
    training: list[TrainingMatch] = Field(default_factory=list)
    training_note: str
