"""One Myro — enforced, because a prompt-only voice rule decays.

Six prompts produced prose a user reads and had invented five characters to do
it: a "senior recruiter" rewrote the CV, a "precise CV analyst" judged skills, a
"job-search concierge" ran the search chat, a "career coach" wrote both the
interview brief and the outreach, a "Myro reviewer" wrote the switch plan. Each
was reasonable alone. Together they were strangers who happened to agree.

These tests fail when a surface grows its own persona again, or when a prompt
picks the wrong register — which is the subtler error and the one that would
have shipped: applying "write TO the reader" to a CV bullet puts Myro's voice
inside the user's own CV.
"""

from __future__ import annotations

import pytest

from app.services import (
    cv_weave,
    gap_planner,
    intent_chat_service,
    job_switch_plan_service,
    myro_voice,
    persona_synthesis,
    prep_brief,
    reach_pack,
)

# Myro addressing the person about themselves.
SPEAKING = {
    "intent_chat_service": intent_chat_service._SYSTEM,
    "prep_brief": prep_brief._SYSTEM_PROMPT,
    "job_switch_plan_service": job_switch_plan_service._DRAFT_SYSTEM,
    "persona_synthesis": persona_synthesis._SYSTEM,
}

# Myro ghost-writing what the USER sends under their own name.
DRAFTING = {
    "cv_weave": cv_weave._SYSTEM,
    "reach_pack": reach_pack._SYSTEM_PROMPT,
}

# Characters these prompts used to introduce themselves as. A surface that
# reaches for a profession imports that profession's habits with it.
BORROWED_CHARACTERS = (
    "senior recruiter",
    "career coach",
    "CV analyst",
    "Myro reviewer",
    "job-search concierge",
)


@pytest.mark.parametrize("name,prompt", sorted(SPEAKING.items()))
def test_every_speaking_surface_is_the_same_myro(name: str, prompt: str) -> None:
    assert myro_voice.IDENTITY in prompt, f"{name} does not open as Myro"
    assert myro_voice.HONESTY in prompt, f"{name} is missing the honesty floor"


@pytest.mark.parametrize("name,prompt", sorted(SPEAKING.items()))
def test_every_speaking_surface_carries_the_address_contract(name: str, prompt: str) -> None:
    """The reader_voice rules are what stop someone's own career document from
    reading as a case file about them. Before this, exactly one of these four
    surfaces carried them."""
    from app.services import reader_voice

    assert reader_voice.prompt_rules() in prompt, f"{name} may address the reader in third person"


@pytest.mark.parametrize("name,prompt", sorted(DRAFTING.items()))
def test_drafting_surfaces_do_not_put_myro_in_the_users_words(name: str, prompt: str) -> None:
    """A CV bullet and a referral message go out under the USER's name. Myro is
    not the speaker, so the identity block must NOT be there — and neither may
    the address contract, which governs writing TO a person, not AS them."""
    from app.services import reader_voice

    assert myro_voice.IDENTITY not in prompt, f"{name} introduces Myro into the user's own words"
    assert reader_voice.prompt_rules() not in prompt, f"{name} uses the wrong register"
    assert myro_voice.HONESTY in prompt, f"{name} is missing the honesty floor"


@pytest.mark.parametrize("name,prompt", sorted(SPEAKING.items()))
def test_a_speaking_prompt_never_contradicts_its_own_address_rule(name: str, prompt: str) -> None:
    """The bug this catches shipped in the first draft of this very change, and no
    other test saw it: the contract said "never call your reader 'the candidate'"
    and four lines later the task block said "the candidate's strongest stories".
    A prompt that both forbids and uses a phrase is a prompt arguing with itself.

    Only the text AFTER the contract is checked — the contract quotes the banned
    nouns to ban them, which is the one legitimate use.
    """
    from app.services import reader_voice

    rules = reader_voice.prompt_rules()
    assert rules in prompt
    body = prompt.split(rules, 1)[1]
    used = [n for n in reader_voice._THIRD_PERSON_NOUNS if n in body.lower()]
    assert not used, f"{name} uses {used} after forbidding it"


@pytest.mark.parametrize("name,prompt", sorted({**SPEAKING, **DRAFTING}.items()))
def test_no_surface_introduces_a_second_character(name: str, prompt: str) -> None:
    lowered = prompt.lower()
    found = [c for c in BORROWED_CHARACTERS if c.lower() in lowered]
    assert not found, f"{name} still calls itself {found} — to the user that is Myro"


def test_the_classifier_has_no_voice_and_needs_none() -> None:
    """gap_planner emits latent|absent verdicts as JSON and never writes a
    sentence anyone reads. Giving it a persona would be decoration on a
    classifier, so it is deliberately outside both registers — asserted here so
    the omission reads as a decision rather than something that was missed."""
    assert myro_voice.IDENTITY not in gap_planner._CLASSIFY_SYSTEM
    assert "JSON" in gap_planner._CLASSIFY_SYSTEM


def test_the_two_registers_are_actually_different() -> None:
    """Guards against a refactor that quietly makes drafting an alias of
    speaking — the failure would be invisible until a user found Myro
    introducing itself inside their CV."""
    speaking = myro_voice.speaking_to_reader("TASK")
    drafting = myro_voice.drafting_for_reader("TASK")
    assert speaking != drafting
    assert "TASK" in speaking and "TASK" in drafting
    assert myro_voice.HONESTY in speaking and myro_voice.HONESTY in drafting
