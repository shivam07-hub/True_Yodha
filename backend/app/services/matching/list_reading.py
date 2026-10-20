"""
services/matching/list_reading.py — how the judge reads a person's /market pile.

ADR-0027 and CONTEXT.md §List Reading. A pile is read in rounds: the next
`ROUND_SIZE` unread jobs, freshest first, go through ONE career-ops triage
call, and only the jobs triage keeps get the full evaluation. Reading stops
when the list is full.

Built so far: the triage round. The rounds, the stop at 40, the recorded pass
and Read more are not built; nothing in production calls this module yet. It
goes live only after `scripts/triage_replay.py` shows the triage keeps at least
90% of the jobs the full evaluation cleared at 3.5.

The triage judges the same person the evaluation judges: both render
`llm_ranker.candidate_brief`. It never sees an overlap number or the matched
skill list — skills qualify a job, they never decide which jobs the judge
reads (ADR-0024). That is the difference from `llm_ranker.triage_shortlist`,
which Match Run still uses and which falls back to the overlap head when the
model fails. A round nobody read here stays unread instead.
"""
from __future__ import annotations

import logging
from typing import Any

from app.services import deal_breakers, llm_ranker
from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

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
