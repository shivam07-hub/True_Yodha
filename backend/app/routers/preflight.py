"""Myro pre-flight — HTTP for the one targeting order.

This router owns transport and nothing else: every decision it makes is one line
long and delegates into `app/services/preflight/*`. Both surfaces (the gate and
the market bottom-sheet) talk to these six routes, so a change applied from the
market is in the gate's brief on the next read.

The contract the review screen prints — *Myro runs on the N lines above and
nothing else* — is enforced HERE, at `/run`, not in the client:
`lines.drop_unanswered` runs before the payload is projected, so a client that
forgets to drop them cannot widen the search.
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.repositories.users import UsersRepository, get_token_users_repository
from app.services import mentor, mentor_learn, new_inventory, targeting_write
from app.services.job_refresh import JobRefresh
from app.services.llm_provider import LLMProvider, get_interactive_provider
from app.services.preflight import lines as line_ops
from app.services.preflight import payload as ops_payload
from app.services.preflight import proposals as proposal_engine
from app.services.preflight.repository import OrderRepository, get_order_repository, now_iso
from app.services.xp_policy import MATCH_RUN_COST

from .jobs._shared import last_monday

router = APIRouter(prefix="/preflight", tags=["preflight"])
logger = logging.getLogger(__name__)

#: How long a dispatched run keeps answering for repeat calls. Long enough to
#: cover a client timeout and the user's retry, short enough that a genuine
#: second search a minute later is a second search.
_RUN_DEDUPE_SECONDS = 90


# ── wire shapes ──────────────────────────────────────────────────────────────


class OrderLineOut(BaseModel):
    id: str
    kind: str
    text: str
    source: str
    source_note: str | None = None
    origin: str
    status: str
    soft: bool = False
    unusable: bool = False
    original_text: str | None = None
    answered_at: str | None = None


class LogEntryOut(BaseModel):
    id: str
    kind: str
    line_id: str
    text: str


class RoundOut(BaseModel):
    key: str
    line_ids: list[str]


class SlotOut(BaseModel):
    """One of the six slots, as the resolver left it.

    `line_ids` is the PLACED set — deduped, uncontested, within arity, and
    identical to what reaches the profile patch. The client renders these; it
    does not file lines into slots itself. Two resolvers is how the screen came
    to show duplicates the server had already collapsed.
    """

    key: str
    arity: int
    line_ids: list[str]
    contested_ids: list[str]


class ConflictOut(BaseModel):
    slot: str
    kind: Literal["arity", "contradiction"]
    line_ids: list[str]
    texts: list[str]
    #: How many this slot can keep. The card asks; it does not re-derive arity.
    keep: int


class OrderState(BaseModel):
    """The order itself — what every mutation returns.

    `rounds` is derived, not stored: a line cannot claim a round its kind
    contradicts."""

    said: str
    lines: list[OrderLineOut]
    log: list[LogEntryOut]
    rounds: list[RoundOut]
    updated_at: str | None = None
    last_run_at: str | None = None
    used: int = 0
    duplicates_collapsed: int = 0
    slots: list[SlotOut] = Field(default_factory=list)
    conflicts: list[ConflictOut] = Field(default_factory=list)


class OrderOut(OrderState):
    """The opening read. Carries the things that do NOT change when the user
    answers a line, so a yes costs one row read and one write instead of
    re-importing every memory note per click.

    The PRICE is deliberately not here — see `GET /preflight/price`.
    """

    starters: list[str] = Field(default_factory=list)
    memory_count: int = 0
    cv_readiness: str | None = None


class PriceOut(BaseModel):
    """What a run costs right now, and why.

    Split off `GET /preflight/order` on 2026-08-22. Pricing needs
    `count_new_jobs_for_user`, an unindexed-in-practice count over `jobs` that
    read-timed-out at 8s four times in one hour of prod logs — and it was inside
    the handler that renders the modal, so one number nobody had asked for held
    the whole surface at 9.0-10.5s. The order is the thing the user opened; the
    price belongs on the button.

    Server-decided, never a client constant: that is how a "free" promise and a
    100-coin debit end up on the same screen. Same waiver `JobRefresh.start`
    applies at charge time, so the modal and the wallet cannot disagree.
    """

    #: Coins this run will cost — 0 when Myro landed roles this user has never
    #: been matched against.
    run_cost: int
    #: Roles that landed since their last search — the reason it's free.
    new_jobs_count: int


class EffectOut(BaseModel):
    op: Literal["add", "drop"]
    kind: str | None = None
    text: str = ""
    line_id: str | None = None
    label: str = ""


class ProposalOut(BaseModel):
    id: str
    eyebrow: str
    value: str
    why: str
    effects: list[EffectOut]
    costly: bool = False


class ProposalsOut(BaseModel):
    reply: str | None = None
    proposals: list[ProposalOut]


class PatchLineRequest(BaseModel):
    status: Literal["kept", "dropped", "unanswered"] | None = None
    text: str | None = Field(default=None, max_length=240)


class AddLineRequest(BaseModel):
    kind: Literal["role", "location", "wont_take", "lean", "goal", "strength", "pay_floor"]
    text: str = Field(min_length=1, max_length=240)
    origin: Literal["preflight", "market"] = "preflight"


class SaidRequest(BaseModel):
    said: str = Field(min_length=1, max_length=600)


class UndoRequest(BaseModel):
    entry_id: str


class ProposalsRequest(BaseModel):
    """One of the three. `utterance` goes through the mentor; `topic` and
    `free_text` are the market sheet's two ways in."""

    utterance: str | None = Field(default=None, max_length=2000)
    topic: str | None = None
    free_text: str | None = Field(default=None, max_length=600)


class ApplyRequest(BaseModel):
    # One yes per proposal, all accepted in one apply. The old cap of 6 was
    # the slot-arity constant and 422'd a real screen (2026-08-18).
    effects: list[EffectOut] = Field(min_length=1, max_length=32)
    origin: Literal["preflight", "market"] = "market"


class RunOut(BaseModel):
    """The dispatched run. Carries the ticket's own label and balance so the
    client can stream it WITHOUT calling POST /jobs/refresh again — two dispatch
    calls for one search is two charges."""

    ticket_id: str
    cost: int
    progress_label: str
    #: The ticket's own lifecycle. The gate streams this; it must not invent a
    #: phase the Job Refresh never entered.
    state: Literal["queued", "computing", "done"]
    #: null when the run was free — no charge, so no new balance. Keep yours.
    new_coin_balance: int | None = None
    kept: int
    dropped: int
    unanswered: int


# ── read ─────────────────────────────────────────────────────────────────────


def _state(order: line_ops.Order) -> dict:
    return {
        "said": order.said,
        # `ref` is an internal dedupe key. Sending it would invite a client to
        # address a line by its source instead of its id.
        "lines": [
            OrderLineOut(**{k: v for k, v in line.to_dict().items() if k != "ref"})
            for line in order.lines
        ],
        "log": [LogEntryOut(id=e.id, kind=e.kind, line_id=e.line_id, text=e.text) for e in order.log],
        "rounds": [RoundOut(**r) for r in line_ops.rounds(order)],
        "updated_at": order.updated_at,
        "last_run_at": order.last_run_at,
        **ops_payload.client_report(order),
    }


def _mutated(
    orders: OrderRepository, user_id: str, apply: Callable[[line_ops.Order], line_ops.Order]
) -> OrderState:
    """Apply one change under compare-and-set and answer with the new truth.

    The change arrives as a FUNCTION of the current order, not as a finished
    order: `lines` is one jsonb document, so a caller that loads, edits and
    writes will silently erase a concurrent answer. Expressed this way the
    repository can re-read and replay on a lost race. See `OrderRepository.mutate`.
    """
    return OrderState(**_state(orders.mutate(user_id, apply)))


@router.get("/order", response_model=OrderOut)
def get_order(
    principal: Principal = Depends(get_principal),
    orders: OrderRepository = Depends(get_order_repository),
) -> OrderOut:
    """The order, with anything Myro has learned since last time folded in as
    UNANSWERED guesses. Never as kept — see `lines.merge_imports`."""
    bundle = orders.load_bundle(principal.id)
    return OrderOut(
        **_state(bundle.order),
        starters=bundle.starters,
        memory_count=bundle.memory_count,
        cv_readiness=bundle.cv_readiness,
    )


@router.get("/price", response_model=PriceOut)
def get_price(
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> PriceOut:
    """What the next run costs. Its OWN request, because it is slow.

    `count_new_jobs_for_user` is the expensive half of what used to be one read:
    a count over `jobs` since this user's marker that read-timed-out at 8s
    repeatedly in prod. Inside `/order` it held the plates, the say band and
    every edit hostage to a number that only decides what the button says.

    Alone, it blocks nothing but the button — and the button is the one control
    that genuinely must not be pressed before the price is known.
    """
    new_jobs = new_inventory.count_for_user(repo, principal.id)
    # Same waiver the charge itself uses (JobRefresh.start).
    return PriceOut(
        run_cost=0 if new_jobs > 0 else MATCH_RUN_COST,
        new_jobs_count=new_jobs,
    )


# ── write ────────────────────────────────────────────────────────────────────


@router.put("/order/said", response_model=OrderState)
def set_said(
    body: SaidRequest,
    principal: Principal = Depends(get_principal),
    orders: OrderRepository = Depends(get_order_repository),
) -> OrderState:
    """Screen 1's one question. The user's own words, stored verbatim — sentence
    one of the brief is built from this and never rewritten."""
    return _mutated(orders, principal.id, lambda o: line_ops.replace_said(o, body.said))


@router.patch("/order/lines/{line_id}", response_model=OrderState)
def patch_line(
    line_id: str,
    body: PatchLineRequest,
    principal: Principal = Depends(get_principal),
    orders: OrderRepository = Depends(get_order_repository),
) -> OrderState:
    """yes / no / undo / reword. A reword counts as yes and stamps the line
    `user_reworded` forever — `lines.reword` owns that rule, not this route."""
    if body.text is None and body.status is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to change.")

    now = now_iso()

    def apply(order: line_ops.Order) -> line_ops.Order:
        if order.find(line_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="No such line on your order."
            )
        if body.text is not None:
            return line_ops.reword(order, line_id, body.text, now=now)[0]
        if body.status == "kept":
            return line_ops.keep(order, line_id, now=now)[0]
        if body.status == "dropped":
            return line_ops.drop(order, line_id, now=now)[0]
        return line_ops.unanswer(order, line_id)[0]

    return _mutated(orders, principal.id, apply)


@router.post("/order/lines", response_model=OrderState, status_code=status.HTTP_201_CREATED)
def add_line(
    body: AddLineRequest,
    principal: Principal = Depends(get_principal),
    orders: OrderRepository = Depends(get_order_repository),
) -> OrderState:
    return _mutated(
        orders,
        principal.id,
        lambda o: line_ops.add(
            o, kind=body.kind, text=body.text, source="user_said", origin=body.origin, status="kept"
        )[0],
    )


@router.post("/order/undo", response_model=OrderState)
def undo_entry(
    body: UndoRequest,
    principal: Principal = Depends(get_principal),
    orders: OrderRepository = Depends(get_order_repository),
) -> OrderState:
    """Reverse one logged change. Restores the line's PRIOR state whole — a line
    the user had merely not answered goes back to unanswered, not to dropped."""
    return _mutated(orders, principal.id, lambda o: line_ops.undo(o, body.entry_id))


@router.post("/order/apply", response_model=OrderState)
def apply_effects(
    body: ApplyRequest,
    principal: Principal = Depends(get_principal),
    orders: OrderRepository = Depends(get_order_repository),
) -> OrderState:
    """Accept a proposal. The effects the client sends back are the ones it
    showed the user, so what they saw is what lands."""
    now = now_iso()

    def apply(order: line_ops.Order) -> line_ops.Order:
        for effect in body.effects:
            if effect.op == "drop" and effect.line_id:
                order, _ = line_ops.drop(order, effect.line_id, now=now)
            elif effect.op == "add" and effect.kind and effect.text:
                order, _ = line_ops.add(
                    order,
                    kind=effect.kind,  # type: ignore[arg-type]
                    text=effect.text,
                    source="user_said",
                    source_note="your words, just now",
                    origin=body.origin,
                    status="kept",
                )
        return order

    return _mutated(orders, principal.id, apply)


# ── propose ──────────────────────────────────────────────────────────────────


@router.post("/proposals", response_model=ProposalsOut)
async def make_proposals(
    body: ProposalsRequest,
    background_tasks: BackgroundTasks,
    principal: Principal = Depends(get_principal),
    orders: OrderRepository = Depends(get_order_repository),
    provider: LLMProvider = Depends(get_interactive_provider),
) -> ProposalsOut:
    """Turn what the user said into changes they can answer one at a time.

    Proposes only. Nothing here touches the order — `/order/apply` does, and
    only after the user has seen the diff.
    """
    order = orders.load(principal.id)

    if body.topic:
        proposal = proposal_engine.from_topic(body.topic, order)
        return ProposalsOut(proposals=[ProposalOut(**proposal.to_dict())] if proposal else [])

    if body.free_text:
        proposal = proposal_engine.from_free_text(body.free_text, order)
        return ProposalsOut(proposals=[ProposalOut(**proposal.to_dict())] if proposal else [])

    if not body.utterance:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Say something first.")

    # One voice, one seam — the mentor reads the free text; it never decides
    # what happens to the order. extract=True: this screen already asked the
    # one question. Interviewing here puts a question in a bubble with no yes/no.
    turn = await mentor.converse(
        get_supabase_admin(), principal.id, "job_intent",
        [{"role": "user", "content": body.utterance}], provider,
        extract=True,
    )
    # Best-effort, off the reply path: the turn is the user's own words about the
    # work they want, and the distiller feeds it back as memory next time.
    background_tasks.add_task(mentor_learn.learn_from_turn, principal.id, body.utterance, "job_intent")

    built = proposal_engine.from_utterance(turn.proposals, order)
    return ProposalsOut(reply=turn.reply, proposals=[ProposalOut(**p.to_dict()) for p in built])


# ── run ──────────────────────────────────────────────────────────────────────


@router.post("/run", response_model=RunOut, status_code=status.HTTP_202_ACCEPTED)
async def run_order(
    principal: Principal = Depends(get_principal),
    orders: OrderRepository = Depends(get_order_repository),
    users_repo: UsersRepository = Depends(get_token_users_repository),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> RunOut:
    """Sign off and dispatch.

    Order of operations is load-bearing: drop the unanswered lines, project the
    kept ones onto the profile, THEN charge and dispatch. Saving before spending
    is why a charge can never land against stale targeting.

    Every DB call below is the blocking Supabase client. Run inside `async def`
    they would hold the event loop for the whole projection — every other
    request on the worker waits behind one user's sign-off — so the sync half is
    handed to a threadpool and only the dispatch is awaited.
    """
    # Idempotency FIRST, before any work. A run that appears to do nothing gets
    # clicked again, and each call that reaches here is another MATCH_RUN_COST
    # off the wallet. The client's in-flight guard does not survive two tabs, a
    # reload, or a retry after a timeout; this does.
    existing = await run_in_threadpool(orders.recent_run, principal.id, within_seconds=_RUN_DEDUPE_SECONDS)
    if existing:
        state = await JobRefresh.status_or_none(principal.id, existing)
        if state is not None and state.state in ("queued", "computing"):
            logger.info("metric preflight.run_deduped user=%s ticket=%s", principal.id, existing)
            counts = await run_in_threadpool(_settled_counts, orders, principal.id)
            return RunOut(
                ticket_id=existing,
                cost=0,  # already charged by the call that started this ticket
                progress_label=state.progress_label,
                state=state.state,
                new_coin_balance=None,
                **counts,
            )

    order = line_ops.drop_unanswered(await run_in_threadpool(orders.load, principal.id))
    summary = ops_payload.run_summary(order)
    if summary["kept"] == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nothing to run — say what you're after first.",
        )
    # A search with no role is not a narrower search, it is a different one.
    # `resolve` omits an empty slot from the spec and `targeting_write.apply`
    # is a PATCH, so dispatching here would run against whatever titles the
    # profile still held — invisible to the person who just signed off.
    if not any(line.kind == "role" for line in order.kept()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add a role you want — Myro searches on the work, not on the exclusions.",
        )

    await run_in_threadpool(
        targeting_write.apply, users_repo, principal.id, ops_payload.project(order)
    )

    ticket = await JobRefresh.start(principal.id, repo, last_monday())
    # Stamped AFTER dispatch with the ticket it produced: a run recorded before
    # the charge succeeds would dedupe the retry of a run that never started.
    await run_in_threadpool(orders.save, principal.id, order, ticket_id=ticket.id)

    return RunOut(
        ticket_id=ticket.id,
        cost=ticket.xp_charged,
        progress_label=ticket.progress_label,
        state=ticket.state,
        new_coin_balance=ticket.new_coin_balance,
        kept=summary["kept"],
        dropped=summary["dropped"],
        unanswered=summary["unanswered"],
    )


def _settled_counts(orders: OrderRepository, user_id: str) -> dict[str, int]:
    """The counts a deduped run reports — read off the order that was dispatched,
    so the second caller sees the same numbers as the first."""
    summary = ops_payload.run_summary(line_ops.drop_unanswered(orders.load(user_id)))
    return {"kept": summary["kept"], "dropped": summary["dropped"], "unanswered": summary["unanswered"]}
