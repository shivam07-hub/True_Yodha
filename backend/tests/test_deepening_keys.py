"""`job_deepenings` keys are declared once and imported — never retyped.

Several stores share that table, told apart only by a `prompt_key` string.
Both ways of getting it wrong are silent:

  * a MISS reads as "not cached yet" and the caller pays again — an LLM call,
    or 50 coins for a weave already on the shelf;
  * a COLLISION overwrites a purchased artifact with someone else's payload.

`_PACK_PROMPT_KEY = "reach_pack"` really was declared privately in BOTH reach
modules. Renaming one would have broken the other with no error anywhere.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.routers.jobs import deepen, prep, reach, reach_targets
from app.services import cv_weave, jd_brief, jd_coverage
from app.services.deepening_keys import (
    DeepeningKey,
    assert_deepener_namespace_is_disjoint,
    reserved,
)

APP = Path(__file__).resolve().parents[1] / "app"
REGISTRY = APP / "services" / "deepening_keys.py"


def test_every_store_key_is_unique_and_non_empty():
    values = [k.value for k in DeepeningKey]
    assert len(values) == len(set(values))
    assert all(v.strip() for v in values)
    assert reserved() == set(values)


def test_the_keys_still_spell_exactly_what_is_already_in_the_table():
    """Cached rows are addressed by these strings. Changing one silently orphans
    every row written before the change — 37 jd_coverage rows across 19 users at
    the time this landed."""
    assert cv_weave.CACHE_PROMPT_KEY == "cv_weave"
    assert jd_coverage.CACHE_PROMPT_KEY == "jd_coverage"
    assert jd_brief.CACHE_PROMPT_KEY == "jd_brief"
    assert prep._BRIEF_PROMPT_KEY == "prep_brief"
    assert reach._PACK_PROMPT_KEY == "reach_pack"


def test_both_reach_modules_read_the_same_key_object():
    """Not merely equal — the SAME member, so they cannot drift apart."""
    assert reach._PACK_PROMPT_KEY is reach_targets._PACK_PROMPT_KEY
    assert reach._PACK_PROMPT_KEY is DeepeningKey.REACH_PACK


def test_a_deepener_may_not_claim_a_reserved_store():
    assert not set(deepen._PROMPTS) & reserved()
    with pytest.raises(RuntimeError, match="collide"):
        assert_deepener_namespace_is_disjoint({"cv_weave": "steal the proposal"})
    # An unrelated namespace is fine.
    assert_deepener_namespace_is_disjoint({"funnel": "...", "compare": "..."})


def test_no_module_outside_the_registry_types_a_key_literal():
    """The rule this whole module exists to hold. A new store adds a member to
    DeepeningKey; it does not add a string to a router."""
    offenders: list[str] = []
    pattern = re.compile(r'^[A-Z_]*PROMPT_KEY[A-Z_]*\s*(?::[^=]+)?=\s*["\']', re.MULTILINE)
    for path in APP.rglob("*.py"):
        if path == REGISTRY:
            continue
        for match in pattern.finditer(path.read_text()):
            line = match.group(0).strip()
            offenders.append(f"{path.relative_to(APP)}: {line}")
    assert not offenders, (
        "declare the key in app/services/deepening_keys.py and import it: "
        + "; ".join(offenders)
    )
