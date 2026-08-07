"""Stage B — judgment over Stage A's candidates. Marking, not generating.

Stage A reads a job's text against the taxonomy and produces a floor: which
skills are named, and where in the document. Stage B answers the part
determinism cannot — *is this skill actually required, and how deep* — and
upgrades the floor in place.

The reframe that makes this affordable is the shape of the ask. The scraper's
enrichment asks one model, in one call, to write a 35-word summary AND pick a
role domain AND choose skills from a list it retrieved itself. Here the model
receives a closed list and returns one short verdict per item. Three
consequences:

  * **It cannot invent a skill.** `parse_judgment` drops any name not in the
    candidate set, so an off-taxonomy hallucination is structurally impossible
    rather than merely discouraged. This is why a small local model is
    defensible on this path where [[feedback_no_cheap_models_judgment]] would
    normally forbid it: the model is not producing a verdict from nothing, it
    is marking items already validated against the taxonomy. Take away the
    closed list and that rule applies again in full.
  * **Output is bounded and small** — one line per candidate, so `max_tokens`
    is a function of the candidate count instead of a guess.
  * **Stage A's evidence travels as the prior.** The model is told where each
    skill appeared and corrects that reading rather than starting blank. A JD
    that lists Python under "Requirements" should not need a model to discover
    it; the model is there for the cases position gets wrong.

One candidate source, deliberately. The scraper has its own TF-IDF retriever
(`rag_skills.retrieve`) that answers the same question differently — two
extractors disagreeing about what a job needs is the coupling this engine keeps
removing.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Iterable

from app.services.skill_extraction import ExtractedSkill

logger = logging.getLogger(__name__)

# A verdict line is `12|required|3` — about six tokens. Ten gives room for a
# model that pads with a space or a bullet without paying for a JSON scaffold
# this format does not have. Even a full 30-candidate job lands near 350, well
# under the flat 512 the enrichment path spends on every call regardless of how
# much there is to say.
_TOKENS_PER_CANDIDATE = 10
_TOKEN_FLOOR = 48
MAX_CANDIDATES = 30

VERDICTS = ("required", "preferred", "absent")

_ZONE_AS_PRIOR = {
    "must_have": "named under a requirements heading",
    "preferred": "named under a preferred/nice-to-have heading",
    "mentioned": "named in the body only",
}

_PROMPT = """\
Job title: {title}

Job description:
{jd}

Below are skills found in that description by exact taxonomy matching, with
where each one appeared. For EACH, decide whether the job actually requires it.

{candidates}

Reply with one line per skill, in the same order, in the form:
<number>|<required|preferred|absent>|<level 1-4>

  required  the job cannot be done without it
  preferred nice to have, a plus, or listed as desirable
  absent    the words appear but the job does not need this skill

  level 1 exposure · 2 hands-on/1-3 yrs · 3 strong/lead/3-5 yrs · 4 expert/5+ yrs
  Level describes the DEPTH the job needs. Use 2 when the text gives no signal.

Mark `absent` freely — matching is literal and catches words used in other
senses. Return only the lines, nothing else."""


@dataclass(frozen=True)
class SkillVerdict:
    """One judged skill. `taxonomy_key` is always a key that was offered."""

    taxonomy_key: str
    verdict: str
    required_level: int

    @property
    def is_required(self) -> bool:
        return self.verdict == "required"


def budget_tokens(candidate_count: int) -> int:
    """Output ceiling for a judgment call of this size.

    Derived rather than guessed: the enrichment path it replaces sets a flat
    512 (or 2048 for a reasoning model) and hopes, which is how a ~120-token
    answer ends up costing a minute of generation.
    """
    return _TOKEN_FLOOR + _TOKENS_PER_CANDIDATE * max(0, candidate_count)


def build_judgment_prompt(
    title: str, job_description: str, candidates: list[ExtractedSkill], *, jd_chars: int = 2400
) -> str:
    """The prompt for one job. Pure — no model, no DB."""
    lines = [
        f"{i}. {skill.taxonomy_key} ({_ZONE_AS_PRIOR.get(skill.zone, 'named in the body only')})"
        for i, skill in enumerate(candidates, start=1)
    ]
    return _PROMPT.format(
        title=title.strip(),
        jd=(job_description or "").strip()[:jd_chars],
        candidates="\n".join(lines),
    )


def _coerce_level(raw: str) -> int:
    match = re.search(r"[1-4]", raw)
    return int(match.group()) if match else 2


def parse_judgment(text: str, candidates: list[ExtractedSkill]) -> list[SkillVerdict]:
    """Verdicts for the candidates the model actually ruled on.

    Position-addressed rather than name-addressed: the model answers by index,
    so a mangled or paraphrased skill name cannot change WHICH skill is being
    judged. Anything that does not resolve to an offered candidate is dropped —
    that is what makes hallucinating a skill impossible rather than unlikely.
    Unparseable lines are skipped, not defaulted, so a garbled response yields
    fewer verdicts instead of confident wrong ones.
    """
    if not candidates:
        return []
    by_index: dict[int, SkillVerdict] = {}
    for raw_line in (text or "").splitlines():
        line = raw_line.strip().strip("`").lstrip("-• ").strip()
        if not line or "|" not in line:
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 3:
            continue
        index_match = re.match(r"^\d+", parts[0])
        if not index_match:
            continue
        index = int(index_match.group())
        if not (1 <= index <= len(candidates)):
            continue
        verdict = parts[1].lower()
        if verdict not in VERDICTS:
            continue
        if verdict == "absent":
            by_index[index] = SkillVerdict(candidates[index - 1].taxonomy_key, "absent", 0)
            continue
        by_index[index] = SkillVerdict(
            candidates[index - 1].taxonomy_key, verdict, _coerce_level(parts[2])
        )
    return [by_index[i] for i in sorted(by_index)]


def to_skill_rows(verdicts: Iterable[SkillVerdict]) -> list[ExtractedSkill]:
    """Judged verdicts back into the shape `skill_floor.write_skill_floor` takes.

    `absent` is dropped rather than persisted: the job does not need that skill,
    and a row saying so would still put it in the candidate pool.
    """
    rows: list[ExtractedSkill] = []
    for verdict in verdicts:
        if verdict.verdict == "absent":
            continue
        rows.append(
            ExtractedSkill(
                taxonomy_key=verdict.taxonomy_key,
                zone="must_have" if verdict.is_required else "preferred",
                required_level=verdict.required_level,
                confidence=0.95 if verdict.is_required else 0.85,
            )
        )
    return rows


async def judge_skills(
    title: str,
    job_description: str,
    candidates: list[ExtractedSkill],
    *,
    provider: Any = None,
    local: bool = False,
) -> list[SkillVerdict] | None:
    """Mark Stage A's candidates. `None` means the model was never reached.

    The distinction is load-bearing and cost 50 jobs to learn. `[]` means the
    model ruled and nothing survived — an answer about the job, so the attempt
    is spent. `None` means OUR side failed (endpoint down, request timeout),
    which is not an answer, so the caller must release its claim and let the job
    be judged later. Stamping those as judged marked 50 jobs done that had
    received no judgment and could never become eligible again — the same shape
    as a failed check refreshing its own verdict.

    Either way Stage A's floor stays persisted, so a job is never left worse off
    than deterministic extraction made it.
    """
    trimmed = candidates[:MAX_CANDIDATES]
    if not trimmed:
        return []
    if provider is None:
        if local:
            from app.services.llm_provider import get_local_provider

            provider = get_local_provider()
        else:
            from app.services.llm_provider import get_llm_provider

            provider = get_llm_provider()

    prompt = build_judgment_prompt(title, job_description, trimmed)
    try:
        text = await provider.complete(
            [
                {
                    "role": "system",
                    "content": "You mark a fixed list of skills. Reply only with the requested lines.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=budget_tokens(len(trimmed)),
            temperature=0.0,
        )
    except Exception as exc:  # noqa: BLE001 — the floor already stands; never degrade it
        logger.warning("metric skill_judgment.unreachable candidates=%d: %s", len(trimmed), exc)
        return None
    verdicts = parse_judgment(text, trimmed)
    logger.info(
        "metric skill_judgment.judged offered=%d ruled=%d required=%d",
        len(trimmed), len(verdicts), sum(1 for v in verdicts if v.is_required),
    )
    return verdicts


def judgment_debug(verdicts: list[SkillVerdict]) -> str:
    """Compact one-line summary for run logs."""
    return json.dumps(
        {v.taxonomy_key: f"{v.verdict}/L{v.required_level}" for v in verdicts},
        ensure_ascii=False,
    )
