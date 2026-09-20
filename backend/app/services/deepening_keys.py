"""Every key `job_deepenings` is addressed by, in one place.

`job_deepenings` is not one cache. It is several stores sharing a table, told
apart only by a `prompt_key` string — a purchased weave proposal, a JD's parsed
coverage, a JD brief, a reach pack, a prep brief, and the per-deepener answers
the dashboard buys. Every one of them was addressed by a literal typed at the
call site, and two of them were typed twice:
`_PACK_PROMPT_KEY = "reach_pack"` lived privately in BOTH `jobs/reach.py` and
`jobs/reach_targets.py`, so renaming one would have left the other reading an
empty cache with no error anywhere.

Two failure modes, both silent, both expensive:

* **A miss.** A key that matches nothing reads as "not cached yet", and the
  caller pays an LLM call — or 50 coins — for work already on the shelf. Nothing
  raises; the user is simply charged twice.
* **A collision.** `POST /jobs/{id}/deepen/{prompt_key}` writes whatever key its
  path names, bounded only by that router's own `_PROMPTS` dict. A deepener
  added under the name `cv_weave` would overwrite a user's purchased proposal.

So keys are **declared here and imported**, never written as a literal, and the
two namespaces are asserted disjoint at import time — a collision cannot reach
production because the process will not start with one.

See [[feedback_a_scoping_key_must_name_something_that_exists]]: an unmatched
equality degrades silently, forever.
"""
from __future__ import annotations

from enum import StrEnum


class DeepeningKey(StrEnum):
    """A reserved `job_deepenings.prompt_key`. One member per store.

    `StrEnum`, so a member is usable anywhere the repository wants a `str` and
    compares equal to the stored value — no call site needs `.value`.
    """

    #: The JD's parsed requirements + per-requirement story coverage.
    JD_COVERAGE = "jd_coverage"
    #: The JD understood once, boilerplate removed (locations, seniority, asks).
    JD_BRIEF = "jd_brief"
    #: A purchased Tailor-with-Mentor proposal and its Keep/Take progress.
    CV_WEAVE = "cv_weave"
    #: The reach pack — who to contact at this company, and with what.
    REACH_PACK = "reach_pack"
    #: The prep brief for this job's prep room.
    PREP_BRIEF = "prep_brief"


def reserved() -> frozenset[str]:
    """Every key owned by a named store. Nothing else may write one."""
    return frozenset(k.value for k in DeepeningKey)


def assert_deepener_namespace_is_disjoint(deepener_keys: object) -> None:
    """Fail at import if a dashboard deepener claims a reserved key.

    Called by the deepen router with its own `_PROMPTS`. A deepener answer is a
    paragraph of text; a reserved key holds a structured artifact a user paid
    for. One writing over the other is data loss with no error, so this is a
    hard failure at startup rather than a check on the request path.
    """
    keys = set(deepener_keys) if isinstance(deepener_keys, (dict, set, frozenset, list, tuple)) else set()
    clash = keys & reserved()
    if clash:
        raise RuntimeError(
            "deepener prompt_key(s) collide with a reserved job_deepenings store: "
            f"{sorted(clash)}. Rename the deepener, or give it its own store in "
            "app/services/deepening_keys.py."
        )
