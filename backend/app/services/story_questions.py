"""The standing completion queue — one question, two places (BACKLOG #13 L3).

The upload bridge mints a Career Story from every line of an uploaded CV, and a
CV bullet is a summary of a summary. `story_depth` already says whether a story
was actually told and whether its bullet is whole against the house standard;
this module turns what is missing into the question that closes it.

The same question object is asked in two places. In the job room it rides the
weak requirement whose evidence is that story (`cv_weave_interview`), so the user
sees not only "this is thin" but exactly which fact would make it count. In
Stories it stands as a queue of its own. Answering in either place banks an
inflow carrying `upgrades_story_id`, the ingest folds the telling into that same
story, and the story becomes told.

**Never asked twice is derived, not bookkept.** A story leaves this queue for the
same reason it stops being capped to `weak` in `jd_coverage`: it is now told and
its bullet is whole. There is no "answered" flag to drift out of step with the
data — one reading of the story decides both.

The one piece of stored state is the decline. ADR-0016 forbids inventing the
number a bullet is missing, so "there is no number for this one" is a legitimate
terminal answer, and without it the queue is a counter that never reaches zero.

Everything here is deterministic. No model is asked what is missing, and nothing
is written back to the user's words.
"""
from __future__ import annotations

from typing import Any

from app.services import story_depth

#: How many questions travel with the profile. The count is honest and separate,
#: so a long queue refills as it is worked rather than paying for itself on every
#: read of the Stories tab.
QUEUE_PAGE = 20

NUMBER = "number"
SUBSTANCE = "substance"
_ORDER = (NUMBER, SUBSTANCE)

# Short on purpose. In the Stories queue the prompt below already asks in full,
# so these would only restate it; in the job room they ride a candidate option
# with no prompt beside it, and are the whole explanation of why the ask stayed
# open. They also have to survive a 375px pill without wrapping inside it.
_MISSING_NUMBER = "no number in this line"
_MISSING_STORY = "never told in full"

_PROMPTS = {
    (NUMBER,): "How big was it? A number, a share, a before-and-after — whatever you actually know.",
    (SUBSTANCE,): "What did you actually do to get there?",
    (NUMBER, SUBSTANCE): "What did you actually do — and how big was it?",
}


def ask_for(story: dict[str, Any], pointer: str) -> tuple[tuple[str, ...], list[str]]:
    """(kinds, the missing pieces in the user's terms) for one story.

    **Only facts the user alone holds become questions.** `story_depth` also
    reports when a bullet sits outside the house 18-30 word band, and that gap
    deliberately does NOT reach this queue: a line's length is an edit Myro can
    make on its own, and measured against the live reservoir the word count is a
    bad proxy for a missing fact. It flagged

        "Halted manual release effort by 50% by implementing Jenkins CI/CD
         pipelines for build, test, and deployment automation"

    — 17 words, one under the band — as missing "what you actually did", which
    the sentence says outright. A standing queue that asks about good bullets
    teaches the user to ignore it.

    So the two asks are the two real axes, and the live reservoir proves they are
    not the same one: every story the upload bridge has minted fills three STAR
    fields — `told` — and yet carries no number at all.

      number     no figure in the line and no metric recorded on the story
      substance  fewer than three STAR fields, so it was never actually told

    A story with no canonical pointer asks nothing: there is no bullet to put in
    front of the user, and what it needs is a projection, not an answer.
    """
    bullet = " ".join((pointer or "").split())
    if not bullet:
        return (), []
    metrics = story.get("metrics") or []
    kinds: list[str] = []
    missing: list[str] = []
    if not story_depth.pointer_carries_measure(bullet, metrics):
        kinds.append(NUMBER)
        missing.append(_MISSING_NUMBER)
    if not story_depth.is_told(story):
        kinds.append(SUBSTANCE)
        missing.append(_MISSING_STORY)
    return tuple(sorted(set(kinds), key=_ORDER.index)), missing


def prompt_for(kinds: tuple[str, ...]) -> str:
    """The question itself.

    It never echoes the user's sentence back at them in Myro's grammar — the
    bullet is on the card directly above, so the card is the echo and this is
    only the ask.
    """
    return _PROMPTS.get(tuple(sorted(set(kinds), key=_ORDER.index)), _PROMPTS[(NUMBER,)])


def question_for(
    story: dict[str, Any], pointer: str, role_label: str = "",
) -> dict[str, Any] | None:
    """One open question, or None when this bullet is already whole and told."""
    kinds, missing = ask_for(story, pointer)
    if not kinds:
        return None
    return {
        "story_id": str(story["id"]),
        "title": story.get("title") or "",
        "role_label": role_label,
        "pointer": pointer,
        "kinds": list(kinds),
        "missing": missing,
        "prompt": prompt_for(kinds),
    }


def build_queue(
    stories: list[dict[str, Any]],
    pointer_by_story: dict[str, str],
    role_label_by_story: dict[str, str] | None = None,
    awaiting: set[str] | None = None,
    page: int = QUEUE_PAGE,
) -> dict[str, Any]:
    """The queue as the Stories tab reads it: questions, totals, set-aside count.

    `awaiting` are stories whose answer is already banked and still being read.
    Asking again while the ingest is in flight is the one way this surface could
    ask twice, and it is the reason the ledger of pending inflows is consulted
    here rather than trusted to a client that survives a reload.
    """
    waiting = awaiting or set()
    labels = role_label_by_story or {}
    dated: list[tuple[str, dict[str, Any]]] = []
    set_aside = 0

    for story in stories:
        if (story.get("status") or "active") != "active":
            continue
        sid = str(story["id"])
        question = question_for(story, pointer_by_story.get(sid, ""), labels.get(sid, ""))
        if question is None:
            continue
        if story.get("completion_declined_at"):
            set_aside += 1
            continue
        if sid in waiting:
            continue
        dated.append((str(story.get("created_at") or ""), question))

    # Newest first — a story banked recently is the one the user still has in
    # their head — then both gaps ahead of one. Two stable passes, so the second
    # orders by how much is missing without losing the first's recency.
    dated.sort(key=lambda pair: pair[0], reverse=True)
    dated.sort(key=lambda pair: -len(pair[1]["kinds"]))
    open_questions = [q for _at, q in dated]
    # Both counts are sent, because the two asks OVERLAP: a bullet can be missing
    # its number AND never have been told. A reader deriving one as
    # `total - other` would have reported zero stories-to-tell for a queue whose
    # only question was asking for both (caught rendering the real reservoir).
    return {
        "questions": open_questions[:page],
        "questions_total": len(open_questions),
        "questions_set_aside": set_aside,
        "missing_number": sum(1 for q in open_questions if NUMBER in q["kinds"]),
        "missing_story": sum(1 for q in open_questions if SUBSTANCE in q["kinds"]),
    }
