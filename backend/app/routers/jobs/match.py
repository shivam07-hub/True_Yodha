import asyncio
import time
from collections.abc import AsyncIterator

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from supabase import Client

from app.deps import Principal, get_principal, get_user_db
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import (
    AgentPickItem,
    AgentPicksResponse,
    JobMatchesResponse,
    RefreshPreflightResponse,
    RefreshStateResponse,
    RefreshTicketResponse,
    UserSkillDemandResponse,
)
from app.schemas.jobs import MatchBrainResult, MatchRetryResponse
from app.services import background, jobs_workflow, new_inventory, progress_stream
from app.services.job_refresh import JobRefresh
from app.services.concurrent_reads import run_concurrently
from app.services.matching import on_demand, targeting
from app.services.xp_policy import MATCH_RUN_COST

from ._shared import last_monday, to_job_match

router = APIRouter()


@router.get("/my-skills/demand", response_model=UserSkillDemandResponse)
def get_my_skill_demand(
    location_scoped: bool = False,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> UserSkillDemandResponse:
    # location_scoped=true → the market rail wants each mover's badge to promise
    # the location-scoped feed it links to (Scoped Skill Demand). Default false
    # keeps the market-wide signal for Forge / practice / peek / landing.
    items = jobs_workflow.build_user_skill_demand(
        repo, principal.id, location_scoped=location_scoped
    )
    return UserSkillDemandResponse(skills=items, total=len(items))


@router.get("/matches", response_model=JobMatchesResponse)
def get_job_matches(
    background_tasks: BackgroundTasks,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobMatchesResponse:
    from datetime import datetime, timezone
    batch_week = last_monday()

    # Root cause of this endpoint's ~1,240ms floor was NEVER query cost
    # (ARCHITECTURE_READ_PATH.md S4-followup). Measured on prod: the match-stack
    # join is 29ms, the dismissed-cards read 1.2ms, the new-inventory count
    # 2.6ms — ~35ms of total database work. The rest was five to six SEQUENTIAL
    # round trips, each paying this Railway<->Supabase path's ~150-300ms fixed
    # overhead. One of them was pure waste: `get_dismissed_job_card_ids` ran
    # TWICE, once inside get_user_match_stack and again to build the response
    # field below.
    #
    # Now: read the dismissed set once, and fan EVERY read out in ONE
    # concurrent wave, so wall time is max(read) instead of sum(reads). Same
    # primitive `_resolve_feed_scope` and `_evidence_stats` already use.
    #
    # The match stack is fetched with `dismissed=set()` — i.e. unfiltered by
    # dismissal — specifically so it does NOT have to wait for the dismissed
    # read to finish. Excluding dismissed job_ids is pure set membership on
    # job_id, and the stack is already deduped to one row per job_id, so
    # applying it after the wave is equivalent to applying it inside. Doing
    # this first cost a second sequential hop (~250ms) for no reason.
    uid = principal.id
    # NOT in the wave, and not because it is fast: `get_feed_updated_at` answers
    # a question about the CORPUS, identical for every user, and is served from
    # the shared cache (Tier 0). A wave section costs a thread and a slot of the
    # process-wide read budget for the whole wave's duration — real cost, paid on
    # every load, for a value that is a Redis hit. This is why the wave was 4
    # sections against a budget of 3 and logged `fanout.over_budget` on every
    # single request: the fourth member was never a user read.
    feed_ts_raw = repo.get_feed_updated_at()
    reads = run_concurrently(
        {
            "dismissed": lambda: set(repo.get_dismissed_job_card_ids(uid)),
            "raw_stack": lambda: repo.get_user_match_stack(uid, dismissed=set()),
            # Two DEPENDENT round trips (last_match_run_at ->
            # count_new_jobs_since), and a third when the profile marker is
            # null and it falls back to MAX(user_job_matches.computed_at) —
            # which is 289 of 479 profiles. More hops than any other member
            # here, but each returns a tiny payload, and on this path cost
            # tracks payload size rather than hop count (a 2-hop /scores/me is
            # 216ms; a 1-hop /cv/versions is 281ms). Whether this or the 46KB
            # raw_stack read actually sets the wave's wall time is what the
            # fanout.slow breakdown is here to answer — do not assume.
            "new_jobs_count": lambda: new_inventory.count_for_user(repo, uid),
        },
        label="jobs.matches",
    )
    dismissed: set[str] = reads["dismissed"]
    rows = [r for r in reads["raw_stack"] if str(r.get("job_id") or "") not in dismissed]
    jobs = [to_job_match(row, batch_week) for row in rows]
    # Best-effort ledger write (its own docstring says so) — nothing below
    # reads its result. Deferred off the read path, same as new_jobs_count's
    # announce_for_user a few lines down: this is one of eight sections
    # /home/bootstrap fans out concurrently (ARCHITECTURE_READ_PATH.md S4),
    # so a write blocking here holds one of the process's shared
    # concurrent-read slots for no reason a user-facing response needs.
    background_tasks.add_task(
        repo.record_recommendation_exposures, principal.id, rows, surface="dashboard"
    )

    feed_updated_at = datetime.fromisoformat(feed_ts_raw) if feed_ts_raw else None

    raw_computed = rows[0].get("computed_at") if rows else None
    matches_computed_at: datetime | None = None
    if raw_computed:
        try:
            matches_computed_at = datetime.fromisoformat(raw_computed)
            if matches_computed_at.tzinfo is None:
                matches_computed_at = matches_computed_at.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            pass

    # Genuine "new jobs since your last match" — live rows whose DB landing time
    # (`ingested_at`) post-dates this user's match compute. Not `last_seen` (bumps
    # on re-crawl), not `first_seen` (a scraper-stamped date that can already be in
    # the past on arrival). Skip for never-matched users — no baseline, nothing new.
    # This same count is the login announcement and the charge waiver: one number,
    # one module, so the bell can never promise what the run then bills for.
    # Read in the concurrent wave above.
    # `None` = the count timed out. Nothing to announce and nothing to promise;
    # it is not zero, but it is not a number we can put on screen either.
    new_jobs_count = reads["new_jobs_count"] or 0

    # The prompt the user actually sees. Projected off the read path so the feed
    # never waits on the inbox write, debounced inside the repo.
    if new_jobs_count > 0:
        background_tasks.add_task(new_inventory.announce_for_user, principal.id, new_jobs_count)

    match_health = jobs_workflow.compute_match_health(repo, principal.id, rows)
    vetted_count = sum(1 for r in rows if r.get("overall_score") is not None)

    return JobMatchesResponse(
        jobs=jobs,
        batch_week=batch_week,
        total=len(jobs),
        feed_updated_at=feed_updated_at,
        matches_computed_at=matches_computed_at,
        new_jobs_count=new_jobs_count,
        # Same set the stack was filtered by — read once, above.
        dismissed_job_ids=sorted(dismissed),
        match_health=match_health,
        match_vetted_count=vetted_count,
    )


@router.post("/matches/retry", response_model=MatchRetryResponse)
def retry_match_vetting(
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> MatchRetryResponse:
    """Re-run the Career-Ops matcher for FREE after a failed / un-vetted run.

    This is NOT the paid Refresh (150 coins, vanity re-run). It re-does work the
    user never received — so it's free, and gated server-side on the match health
    actually being `failed`/`overlap_only`. A `vetted` user can't use it to dodge
    the paid refresh. Re-dispatches the same durable `initial_match` bulk job
    (ADR-0008) with `force` so the brain re-runs even against cached rows."""
    rows = repo.get_user_match_stack(principal.id)
    health = jobs_workflow.compute_match_health(repo, principal.id, rows)
    if health not in ("failed", "overlap_only"):
        # Nothing failed — the free re-vet doesn't apply. (A well-behaved client
        # never shows the button here; this is the honest server-side guard.)
        return MatchRetryResponse(accepted=False, match_health=health)

    # FAST: the user just pressed "retry" and is watching the banner. The bulk
    # lane means "nobody is watching", which was never true of this path.
    background.enqueue(
        background.LANE_FAST,
        "initial_match",
        payload={"user_id": principal.id, "force_context_refresh": True},
        correlation_id=f"revet:{principal.id}",
    )
    return MatchRetryResponse(accepted=True, match_health=health)


@router.get("/agent-picks", response_model=AgentPicksResponse)
def get_agent_picks(
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> AgentPicksResponse:
    """The curated "Myro Agent Picks" band — the Career-Ops brain's hand-vetted
    shortlist that sits ABOVE the algorithm feed (the roles a user is told to
    actually apply to). Empty for users with no picks → the band never renders.
    Editorial layer, distinct from `/matches` (the algorithm layer)."""
    rows = repo.get_agent_picks(principal.id)
    repo.record_recommendation_exposures(
        principal.id, rows, surface="agent_pick"
    )
    return AgentPicksResponse(picks=[AgentPickItem(**row) for row in rows], total=len(rows))


@router.delete("/matches/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_job_match_card(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> None:
    repo.dismiss_dashboard_job_card(principal.id, job_id)


@router.post("/{job_id}/brain", response_model=MatchBrainResult)
async def ensure_job_brain(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> MatchBrainResult:
    """Return the stored Match Verdict. Enqueue the named write if it is missing.

    Opening a job anywhere warms the cache. This request never waits on a model.
    `available=False` means the card keeps showing overlap until the worker lands.
    """
    result = on_demand.open_job_eval(repo, principal.id, job_id)
    if result is None:
        return MatchBrainResult(job_id=job_id, available=False)
    return MatchBrainResult(job_id=job_id, **result)


@router.post("/refresh", response_model=RefreshTicketResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_job_refresh(
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> RefreshTicketResponse:
    """Charge XP + kick off compute. See CONTEXT.md "Job Refresh"."""
    ticket = await JobRefresh.start(principal.id, repo, last_monday())
    return RefreshTicketResponse(
        id=ticket.id,
        state=ticket.state,
        progress_label=ticket.progress_label,
        batch_week=ticket.batch_week,
        xp_charged=ticket.xp_charged,
        new_coin_balance=ticket.new_coin_balance,
        matches_written=ticket.matches_written,
    )


@router.get("/refresh/preflight", response_model=RefreshPreflightResponse)
def get_refresh_preflight(
    principal: Principal = Depends(get_principal),
    db: Client = Depends(get_user_db),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> RefreshPreflightResponse:
    """Targeting Brief manifest for the pre-flight modal — profile columns
    gap-filled from user_memory. Declared BEFORE /refresh/{ticket_id} so
    "preflight" is never captured as a ticket id.

    Also carries the price, from the same waiver the charge itself uses
    (`JobRefresh.start`), so the modal and the wallet can't disagree."""
    brief = targeting.for_preflight(db, principal.id)
    new_jobs = new_inventory.count_for_user(repo, principal.id)
    return RefreshPreflightResponse(
        **brief.preflight(),
        run_cost=0 if new_inventory.waives_charge(new_jobs) else MATCH_RUN_COST,
        new_jobs_count=new_jobs or 0,
    )


@router.get("/refresh/{ticket_id}", response_model=RefreshStateResponse)
async def get_job_refresh_status(
    ticket_id: str,
    principal: Principal = Depends(get_principal),
) -> RefreshStateResponse:
    """Legacy poll endpoint. Superseded by /refresh/{ticket_id}/stream (ADR-0009
    PR2) — kept for deploy-window compatibility + as a manual fallback."""
    state = await JobRefresh.status(principal.id, ticket_id)
    return RefreshStateResponse(
        ticket_id=state.ticket_id,
        state=state.state,
        progress_label=state.progress_label,
        batch_week=state.batch_week,
        matches_written=state.matches_written,
        refund=state.refund,
        new_coin_balance=state.new_coin_balance,
        outcome_kind=state.outcome_kind,
        error=state.error,
        debug=state.debug or None,
    )


@router.get("/refresh/{ticket_id}/stream")
async def stream_job_refresh(
    ticket_id: str,
    principal: Principal = Depends(get_principal),
) -> StreamingResponse:
    """ADR-0009 PR2 — live Job Refresh progress over SSE (replaces the 1s poll).

    Snapshot-watch relay: tails the same Redis state key (prod) / in-process
    state (dev) the legacy poll read, and emits typed `phase` / `done` / `error`
    frames. Terminal frame closes the stream; a hard timeout guarantees the
    connection never hangs (the client re-reads on reconnect).
    """
    user_id = principal.id

    async def gen() -> AsyncIterator[str]:
        started = time.monotonic()
        last_label: str | None = None
        last_done = -1
        while True:
            try:
                state = await JobRefresh.status(user_id, ticket_id)
            except HTTPException:
                yield progress_stream.sse(
                    {"type": "error", "recoverable": False, "message": "Unknown refresh ticket."}
                )
                return

            life = state.state
            if life == "queued":
                stranded = await JobRefresh.abandon_stranded(
                    user_id, ticket_id, time.monotonic() - started
                )
                if stranded is not None:
                    state = stranded
                    life = state.state
            if life in ("queued", "computing"):
                if state.progress_done is not None and state.progress_done != last_done:
                    # Per-job reveal — one role ranked. Stream the running count
                    # + cumulative revealed list (ADR-0009).
                    last_done = state.progress_done
                    yield progress_stream.sse({
                        "type": "progress",
                        "done": state.progress_done,
                        "total": state.progress_total,
                        "label": state.progress_label,
                        "revealed": state.revealed,
                    })
                elif state.progress_label != last_label:
                    last_label = state.progress_label
                    yield progress_stream.sse(
                        {"type": "phase", "phase": life, "label": state.progress_label}
                    )
                else:
                    yield progress_stream.HEARTBEAT
            elif life == "done":
                yield progress_stream.sse({
                    "type": "done",
                    "result": {
                        "state": "done",
                        "ticket_id": state.ticket_id,
                        "progress_label": state.progress_label,
                        "matches_written": state.matches_written,
                        "outcome_kind": state.outcome_kind,
                        "refund": state.refund,
                        "new_coin_balance": state.new_coin_balance,
                    },
                })
                return
            else:  # failed
                yield progress_stream.sse({
                    "type": "error",
                    "recoverable": True,
                    "message": state.error or "Refresh failed. Please try again.",
                    "result": {
                        "state": "failed",
                        "refund": state.refund,
                        "new_coin_balance": state.new_coin_balance,
                    },
                })
                return

            if time.monotonic() - started > progress_stream.TIMEOUT_SECONDS:
                yield progress_stream.sse({
                    "type": "error",
                    "recoverable": True,
                    "message": "Refresh is taking longer than expected — try again.",
                    "result": {"state": "timeout"},
                })
                return
            await asyncio.sleep(progress_stream.TICK_SECONDS)

    return StreamingResponse(
        gen(), media_type="text/event-stream", headers=progress_stream.SSE_HEADERS
    )
