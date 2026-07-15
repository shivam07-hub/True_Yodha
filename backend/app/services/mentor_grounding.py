"""mentor_grounding — the one place Mentor assembles what it writes from.

Every Mentor WRITING surface (per-bullet rewrite, variants, intake draft, whole-CV
restructure, gap-plan draft) needs the same three things, from the same sources, at
the same depth:

  1. the authored CV-playbook rules relevant to this line (STAR/XYZ, ATS, quantify —
     `mentor_retriever`, the curated shelf) — the *method*, enforced silently in the
     prompt, never surfaced to the user;
  2. the user's OWN verified career stories (`memory_recall`) — the truthful raw
     material, so specifics come from what they actually did, not model imagination;
  3. candidate NUMBERS already present in those stories, each carrying its source —
     so a metric-less bullet can be quantified from the user's real history ("your
     'Sales bots' story mentions 40%") instead of a blank ask or an invented figure.

Before this, only `cv_rewrite` assembled (1)+(2), ad-hoc; intake/restructure grounded
differently or not at all — the same "Mentor" label at two different depths, the
inconsistency users feel. This module makes the grounding one seam: assemble once,
compose everywhere. Everything is FAIL-SOFT — grounding is leverage, never an outage;
a writing surface with no grounding still writes (falls back to the static rule).
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from app.services import memory_recall, mentor_retriever
from app.services.mentor_retriever import PlaybookPassage
from app.services.memory_recall import StoryHit

logger = logging.getLogger("myro.mentor_grounding")

# Top-k authored playbook passages + stories to ground one writing turn.
_PASSAGE_K = 3
_STORY_K = 3

# A verbatim number token in a story result — a digit run with an optional
# magnitude/percent/currency suffix. Kept VERBATIM (we never renormalize the user's
# own figure): '40%', '₹2Cr', '10,000', '3x'. Mirrors cv_rewrite's number sense but
# captures the exact source substring for truthful re-use with provenance.
_STORY_METRIC_RE = re.compile(
    r"[₹$€£]?\s?\d[\d,]*(?:\.\d+)?\s?(?:%|x|k|m|bn|mn|cr|crore|crores|lakh|lakhs|"
    r"hrs?|hours?|days?|weeks?|months?|years?)?",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class CandidateMetric:
    """A real number pulled from ONE of the user's stories, with its source, so the
    Mentor can offer it with provenance ('your "X" story mentions 40%') and never
    misattribute it — the user confirms before it lands (Q5)."""
    value: str        # verbatim, e.g. "40%" / "₹2Cr" / "10,000 users"
    story_id: str
    story_title: str


@dataclass
class MentorGrounding:
    passages: list[PlaybookPassage] = field(default_factory=list)
    stories: list[StoryHit] = field(default_factory=list)
    candidate_metrics: list[CandidateMetric] = field(default_factory=list)

    def has_grounding(self) -> bool:
        return bool(self.passages or self.stories)

    def prompt_block(self) -> str:
        """The combined grounding for the model — playbook method + the user's real
        stories. Empty string when nothing grounds (caller then uses the static rule).
        Deliberately excludes candidate_metrics: those drive the user-facing
        provenance prompt, not the model prompt (a number only enters the CV once the
        user confirms it, per the no-fabrication law)."""
        blocks: list[str] = []
        if self.passages:
            rules = "\n".join(f"- {p.chunk_text}  (source: {p.source_title})" for p in self.passages)
            blocks.append("Apply these authored CV-playbook rules (STAR / XYZ / ATS):\n" + rules)
        story_block = memory_recall.story_grounding_block(self.stories)
        if story_block:
            blocks.append(story_block)
        return "\n\n".join(blocks)

    def citations(self) -> list[str]:
        """De-duped playbook source titles, retrieval order — for the internal
        record, NOT the user-facing card (grounding is our method, not their concern)."""
        return list(dict.fromkeys(p.source_title for p in self.passages))


def _metrics_from_stories(stories: list[StoryHit]) -> list[CandidateMetric]:
    """Verbatim numbers found in each story's result, first story first. A story's
    result like 'cut proposal turnaround 40%' yields CandidateMetric('40%', …)."""
    out: list[CandidateMetric] = []
    seen: set[tuple[str, str]] = set()
    for s in stories:
        for m in _STORY_METRIC_RE.finditer(s.result or ""):
            val = m.group(0).strip()
            # A bare "10,000"/"3" with no unit is only a real metric if it has ≥2
            # digits or a suffix — drop lone single digits that match noise.
            digits = re.sub(r"\D", "", val)
            if not digits or (len(digits) < 2 and not re.search(r"[%x₹$€£a-z]", val, re.IGNORECASE)):
                continue
            key = (s.id, val.lower())
            if key in seen:
                continue
            seen.add(key)
            out.append(CandidateMetric(value=val, story_id=s.id, story_title=s.title))
    return out


async def assemble(
    query: str,
    *,
    user_id: str | None = None,
    shelf: str = "cv",
    passage_k: int = _PASSAGE_K,
    story_k: int = _STORY_K,
) -> MentorGrounding:
    """Assemble the full Mentor grounding for one writing turn. Every leg is
    fail-soft (empty on any error) so grounding degrades gracefully and never blocks
    a rewrite. `user_id` None (anon pre-login playground) → playbook only, no stories."""
    passages = await mentor_retriever.retrieve(query, shelf=shelf, k=passage_k)
    stories: list[StoryHit] = []
    if user_id:
        stories = await memory_recall.recall_stories(user_id, query, k=story_k)
    return MentorGrounding(
        passages=passages,
        stories=stories,
        candidate_metrics=_metrics_from_stories(stories),
    )
