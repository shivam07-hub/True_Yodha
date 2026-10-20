"""
services/matching/list_reading.py — how the judge reads a person's /market pile.

ADR-0027 and CONTEXT.md §List Reading. A pile is read in rounds: the next
`ROUND_SIZE` unread jobs, freshest first, go through ONE career-ops triage
call, and only the jobs triage keeps get the full evaluation. Reading stops
when the list is full.

Live: the read target. The /market drain (`feed_warm`) reads the pile freshest
first only while the list holds fewer than `read_target` good jobs, and Read
more raises the target by one list. The triage round below is NOT live: four
replays (ADR-0027) could not make it keep 90% of the jobs the full evaluation
cleared, so every job the drain reads gets the full evaluation. It stays, with
`scripts/triage_replay.py`, until List Reading ships.

The triage judges the same person the evaluation judges: both render
`llm_ranker.candidate_brief`. It never sees an overlap number or the matched
skill list — skills qualify a job, they never decide which jobs the judge
reads (ADR-0024). That is the difference from `llm_ranker.triage_shortlist`,
which Match Run still uses and which falls back to the overlap head when the
model fails. A round nobody read here stays unread instead.
"""
from __future__ import annotations

import logging
import time
from typing import Any

from app.config import settings
from app.services import deal_breakers, llm_ranker
from app.services.llm_provider import LLMProvider, LLMProviderError
from app.services.matching.published_list import LIST_FULL

logger = logging.getLogger(__name__)

#: One Read more asks for one more list's worth of good jobs.
READ_MORE = LIST_FULL
#: How long a Read more holds. Past this the list reads to 40 again.
_TARGET_SECONDS = 7 * 24 * 60 * 60

# user id → (eval context, target, monotonic expiry). Only when Redis is absent.
_LOCAL: dict[str, tuple[str, int, float]] = {}


def _key(user_id: str) -> str:
    return f"list_read_until:{user_id}"


def read_target(user_id: str, eval_ctx: str) -> int:
    """How many good jobs this person's list is read until.

    `LIST_FULL` unless they asked for more under the brief the judge reads now.
    The target is keyed to the eval context, so a new CV, fact, direction or
    prompt reads to 40 again rather than to an old Read more. A store that
    cannot be read reads as 40: not knowing means not spending (as presence).
    """
    url = settings.redis_url.strip()
    if not url:
        held = _LOCAL.get(user_id)
        if held and held[0] == eval_ctx and held[2] > time.monotonic():
            return max(LIST_FULL, held[1])
        return LIST_FULL
    try:
        from redis import Redis

        raw = Redis.from_url(url, decode_responses=True).get(_key(user_id))
    except Exception as exc:  # noqa: BLE001 — unknown reads as the default: no extra spend
        logger.warning("metric list_reading.target_unavailable exc=%s", exc.__class__.__name__)
        return LIST_FULL
    if not raw:
        return LIST_FULL
    ctx, _, number = str(raw).rpartition(":")
    if ctx != eval_ctx or not number.isdigit():
        return LIST_FULL
    return max(LIST_FULL, int(number))


def ask_for_more(user_id: str, eval_ctx: str, cleared: int) -> int:
    """Read more: one more list past what is on it now. Never lowers the target."""
    target = max(read_target(user_id, eval_ctx), cleared) + READ_MORE
    url = settings.redis_url.strip()
    if not url:
        _LOCAL[user_id] = (eval_ctx, target, time.monotonic() + _TARGET_SECONDS)
        return target
    try:
        from redis import Redis

        Redis.from_url(url, decode_responses=True).set(_key(user_id), f"{eval_ctx}:{target}", ex=_TARGET_SECONDS)
    except Exception as exc:  # noqa: BLE001 — the list keeps reading to its old target
        logger.warning("metric list_reading.target_unwritable exc=%s", exc.__class__.__name__)
    return target

#: Jobs one triage call reads. The same chunk `triage_shortlist` uses: a strong
#: model ranks 50 rows well and the prompt stays inside every lane's context.
ROUND_SIZE = 50
#: Most jobs a round sends to the full evaluation. Replays (ADR-0027): at most
#: 15 kept 43% of the good jobs, at most 25 kept 66%. 35 of 50 is the third try.
KEEP_PER_ROUND = 35
#: Description characters per job. With no skill list beside it, the posting
#: itself is the evidence, so this is wider than the old triage's 220.
_SNIPPET = 400
_MAX_TOKENS = 500


def triage_system_prompt(profile: dict[str, Any]) -> str:
    """The career-ops persona for a round, over the evaluation's own brief."""
    brief = llm_ranker.candidate_brief(profile, profile.get("cv_markdown") or "")
    return f"""You are Career Ops, an elite AI career advisor. You are reading a batch of job postings for ONE candidate to choose which deserve your full evaluation.

The full evaluation scores a posting from 0.0 to 5.0 against this candidate, and only postings that reach 3.5 are shown to them. Keep every posting that could reach 3.5 for where this candidate is going — their target roles, places and career goal — read against their CV. When you are unsure, keep it. The full evaluation decides, and a posting you drop here is never shown to them. Drop a posting only when it clearly breaks one of the candidate's won't-take lines. Never drop a posting for being similar to another one in the batch: the same title at another company, in another city or at another level is its own application. Past skills qualify a candidate; they do not set their direction.

{brief}"""


def triage_user_message(jobs: list[dict[str, Any]], keep_n: int) -> str:
    """One numbered line per posting: title, company, place, the description.

    1-based indices, because a model echoes small integers reliably and mangles
    job ids. Deliberately no overlap score and no matched skills.
    """
    lines = []
    for i, job in enumerate(jobs, start=1):
        snippet = " ".join(str(job.get("description") or "").split())[:_SNIPPET]
        lines.append(
            f"{i}. {job.get('title')} — {job.get('company') or 'n/a'} | {job.get('location') or 'n/a'}"
            f"\n   {snippet or 'No description.'}"
        )
    listing = "\n".join(lines)
    return f"""{len(jobs)} postings below. Keep at most {keep_n} that deserve a full evaluation for this candidate, best first. When unsure, keep. Drop only a clear won't-take break, never a posting for resembling another.

{listing}

Respond ONLY with valid JSON, no prose:
{{"shortlist": [<index>, <index>, ...]}}"""


async def triage_round(
    profile: dict[str, Any],
    jobs: list[dict[str, Any]],
    provider: LLMProvider,
    *,
    keep_n: int = KEEP_PER_ROUND,
) -> list[str] | None:
    """Job ids triage keeps for the full evaluation, best first.

    `[]` is a reading: none of these fit. `None` means the round was not read
    (the provider failed or its answer was unreadable), so it stays unread and
    the next pass reads it. Overlap never stands in for the judge.

    A person with no won't-take lines gives the triage nothing to drop for, so
    the whole round goes to the full evaluation and no call is spent. A pay
    floor is not a won't-take line: pay never makes a posting Skip.
    """
    if len(jobs) > ROUND_SIZE:
        raise ValueError(f"a round is at most {ROUND_SIZE} jobs, got {len(jobs)}")
    if not jobs:
        return []
    if not deal_breakers.read(profile).wont_take:
        return [str(job["job_id"]) for job in jobs]
    messages = [
        {"role": "system", "content": triage_system_prompt(profile)},
        {"role": "user", "content": triage_user_message(jobs, keep_n)},
    ]
    try:
        content = await provider.complete(messages, max_tokens=_MAX_TOKENS, temperature=0)
    except LLMProviderError as exc:
        logger.warning("list_reading: triage failed (%s) over %d jobs", exc.__class__.__name__, len(jobs))
        return None
    indices = llm_ranker.parse_triage(content or "", len(jobs), keep_n)
    if indices is None:
        logger.warning("list_reading: triage answer unreadable over %d jobs", len(jobs))
        return None
    return [str(jobs[i]["job_id"]) for i in indices]
