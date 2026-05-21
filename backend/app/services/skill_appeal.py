"""
LLM judge for skill level appeals.

User writes a bullet that they claim proves a target level.
The LLM evaluates against the level criteria and returns:
  - approved: bool
  - verdict: short reason
  - criteria: what was needed (so user understands the bar)

Caller: PATCH /users/me/skills/{key}/level  (when body includes bullet_text)
"""

from __future__ import annotations

import logging

from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

_MAX_TOKENS = 300

# One-sentence bar description per transition (current_level → target_level).
# Used in the LLM prompt so the judge understands the bar.
_LEVEL_CRITERIA: dict[int, str] = {
    1: "L1 (Scout): Awareness level — touched the skill in any real-world or educational context. One shipped task, one project, one workshop qualifies. No measurement required.",
    2: "L2 (Trailblazer): Applied level — used the skill without supervision on at least one end-to-end deliverable that shipped or was used by others.",
    3: "L3 (Excavator): Practitioner level — led with this skill in a real-stakes context. Must show mentoring others, owning architecture/design decisions, or driving measurable outcomes defensible to a hiring manager.",
    4: "L4 (Cartographer): Expert level — deployed at organisational scale with quantifiable, repeatable business impact (e.g. X% improvement, $Y saved, Z users served). Not a one-off project.",
    5: "L5 (Legend): Authority level — external recognition: public talks, published frameworks, or being the person others are measured against in this skill.",
}


def _build_messages(skill: str, target_level: int, bullet_text: str) -> list[dict[str, str]]:
    criteria = _LEVEL_CRITERIA.get(target_level, _LEVEL_CRITERIA[3])

    system = """\
You are a strict but fair skill-level judge for a career platform. \
Your job is to evaluate whether a CV bullet written by a user genuinely \
meets the bar for a claimed proficiency level. \
Be demanding — vague claims or learning-only evidence should fail. \
Real-world, shipped, measurable evidence should pass. \
Respond in exactly the JSON format requested. No markdown."""

    user = f"""\
Skill: {skill}
Claimed level: L{target_level}
Level criteria: {criteria}

Candidate bullet:
"{bullet_text}"

Evaluate whether this bullet meets the bar for L{target_level}.

Respond with valid JSON only, no other text:
{{
  "approved": true | false,
  "verdict": "<one sentence — why approved or rejected>",
  "criteria": "<one sentence — what this level actually requires>"
}}"""

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


async def judge_skill_appeal(
    skill: str,
    target_level: int,
    bullet_text: str,
    provider: LLMProvider | None,
) -> dict:
    """Returns dict with keys: approved (bool), verdict (str), criteria (str).
    Falls back to approved=False with a degraded message if LLM unavailable."""
    fallback = {
        "approved": False,
        "verdict": "LLM unavailable — could not evaluate. Try again in a moment.",
        "criteria": _LEVEL_CRITERIA.get(target_level, ""),
    }
    if not provider:
        return fallback
    if not bullet_text.strip():
        return {
            "approved": False,
            "verdict": "No bullet text provided.",
            "criteria": _LEVEL_CRITERIA.get(target_level, ""),
        }

    messages = _build_messages(skill, target_level, bullet_text)
    try:
        raw = await provider.complete(messages, max_tokens=_MAX_TOKENS)
        if not raw:
            return fallback
        import json
        # Strip any markdown code fences if the model adds them despite instructions.
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        result = json.loads(cleaned)
        return {
            "approved": bool(result.get("approved", False)),
            "verdict": str(result.get("verdict", "")),
            "criteria": str(result.get("criteria", _LEVEL_CRITERIA.get(target_level, ""))),
        }
    except (LLMProviderError, Exception):
        logger.info("skill_appeal: judge failed for skill=%s level=%d", skill, target_level)
        return fallback
