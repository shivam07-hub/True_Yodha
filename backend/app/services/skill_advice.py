"""
AI-powered skill level-up advice.

Given a skill name, current level, and the evidence_text already extracted
from the user's CV, generate a short, personalised coaching message that:
  - mirrors what the user is already doing (using their own evidence words)
  - names exactly what moves the needle from level N → N+1 in their context
  - gives one concrete micro-action for this week
  - shows a pre-filled CV bullet (no [N] / [Company] brackets)

Caller: POST /users/me/skills/level-up-advice
"""

from __future__ import annotations

import logging

from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

_MAX_TOKENS = 400

_LEVEL_FRAME: dict[int, str] = {
    1: "They have named the skill. The jump to L2 is first real-world use — shipped, deployed, or delivered for an organisation, not just learned.",
    2: "They have used it in a real project. The jump to L3 is scale and measurable impact — a number, a team, a system that kept running.",
    3: "They have impact at scale. The jump to L4 is ownership and repeatability — they designed the approach, not just executed it.",
    4: "They own the approach at their organisation. The jump to L5 is external recognition — others cite, adopt, or are taught by them.",
    5: "They are already at the ceiling. Reinforce the signal and suggest how to make it more legible to the market.",
}


def _build_messages(skill: str, current_level: int, evidence_text: str) -> list[dict[str, str]]:
    level_context = _LEVEL_FRAME.get(current_level, _LEVEL_FRAME[3])
    next_level = min(current_level + 1, 5)

    system = """\
You are a direct, sharp career mentor. You write the advice a brilliant senior colleague \
would give — specific, honest, zero corporate fluff. You never use placeholders like \
[Company], [N], or [event]. You refer to what you actually know from the user's evidence. \
Where you don't know a specific number, you name the type of number to find and put it in \
parentheses like (e.g. 12 teams, 3 quarters). You are never generic."""

    user = f"""\
Skill: {skill}
Current level: L{current_level}
Evidence from their CV (what they are already doing):
\"{evidence_text}\"

Level-up context:
{level_context}

Write a coaching message in exactly this structure — no headers, no bullet lists:

Paragraph 1 (2 sentences): Reframe what they are already doing. \
Name it precisely using words from their evidence. \
Tell them why this is strong and what it already signals to a hiring manager.

Paragraph 2 (2 sentences): Name exactly what separates L{current_level} from L{next_level} \
in the context of their specific work. \
Be concrete — what does L{next_level} look like for someone doing what they're doing?

Paragraph 3 (1-2 sentences): Give ONE micro-action they can do THIS WEEK. \
Not "do a project" — something that takes 2 hours and produces a tangible artefact.

Final line: A ready-to-use CV bullet for L{next_level} evidence. \
Start it with a strong action verb. \
Use their actual context from the evidence. \
No brackets. End with a quantified outcome in parentheses like (e.g. €500K pipeline, 8 countries)."""

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


async def generate_skill_advice(
    skill: str,
    current_level: int,
    evidence_text: str,
    provider: LLMProvider | None,
) -> str | None:
    if not provider:
        return None
    if not evidence_text.strip():
        return None

    messages = _build_messages(skill, current_level, evidence_text)
    try:
        return await provider.complete(messages, max_tokens=_MAX_TOKENS)
    except LLMProviderError:
        logger.info("skill_advice: all providers failed for skill=%s level=%d", skill, current_level)
        return None
