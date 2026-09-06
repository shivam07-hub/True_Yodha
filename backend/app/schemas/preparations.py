from __future__ import annotations

from pydantic import BaseModel, Field


class LevelRow(BaseModel):
    """One level this job tests. `has_drill` False = /practice cannot serve it."""

    name: str
    held: int
    required: int
    has_drill: bool


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


class PrepLadderResponse(BaseModel):
    rooms: list[LadderRoom] = Field(default_factory=list)
    totals: LadderTotals
    training: list[TrainingMatch] = Field(default_factory=list)
    training_note: str
