"""reader_voice — the address contract every reader-facing surface shares.

What must never regress:
- third person about the reader is caught (this shipped on the persona canvas
  and read as a case file being discussed about the user);
- machine filler is caught;
- clean second-person prose is NOT caught — a false positive silently deletes
  good writing, which is the one way this guard makes things worse;
- the prompt text and the checker are rendered from the same constants, so a
  rule can never be enforced while the writer is still told it is allowed.
"""
from __future__ import annotations

import pytest

from app.services import reader_voice as rv


# ── third person: the bug this module exists for ─────────────────────────────

@pytest.mark.parametrize(
    "text",
    [
        "Companies they keep coming back to: Godrej, Accenture.",
        "Their search history reveals a focus on product roles.",
        "Targets they set themselves: Forward Deployed Engineer.",
        "The user is currently saving jobs at Airbnb.",
        "This person dismisses senior roles.",
    ],
)
def test_third_person_about_the_reader_is_caught(text: str) -> None:
    found = rv.violations(text)
    assert found, f"missed third person in: {text}"
    assert any(f.startswith("third_person:") for f in found)


def test_machine_tells_and_hollow_tails_are_caught() -> None:
    assert any(v.startswith("machine_tell:") for v in rv.violations(
        "You need to bridge the gap between your skills and experience."
    ))
    assert any(v.startswith("hollow_tail:") for v in rv.violations(
        "You save procurement roles, indicating interest in audit work."
    ))


# ── the expensive failure: deleting good prose ───────────────────────────────

@pytest.mark.parametrize(
    "text",
    [
        "You saved 99 jobs and killed 66 more on sight. You know what you want.",
        "You keep coming back to Godrej and Accenture.",
        "Your gap is New Business Development. Nothing on your CV shows it yet.",
        "You tailored 3 CVs. Every one of them was for a product role.",
        "Bengaluru, Forward Deployed Engineer. That is the whole target.",
    ],
)
def test_clean_second_person_prose_survives(text: str) -> None:
    assert rv.violations(text) == [], f"false positive on: {text}"
    assert rv.is_clean(text)


def test_them_is_guidance_not_enforcement() -> None:
    """Documented gap: 'them' is legitimate for plural things the reader owns,
    so enforcing it deleted correct prose. The writer is still told to avoid it
    for the reader — a false positive in a prompt costs nothing, in the checker
    it costs a good paragraph."""
    assert rv.violations("Every one of them was for a product role.") == []
    assert "'them'" in rv.prompt_rules()


def test_empty_and_none_are_clean() -> None:
    assert rv.violations("") == []
    assert rv.violations(None) == []  # type: ignore[arg-type]


# ── stable metric labels ─────────────────────────────────────────────────────

def test_violations_are_sorted_and_deduped() -> None:
    found = rv.violations("They said they would. They did not.")
    assert found == sorted(found)
    assert len(found) == len(set(found))


# ── prompt and checker cannot drift ──────────────────────────────────────────

def test_prompt_rules_names_every_enforced_rule() -> None:
    rules = rv.prompt_rules().lower()
    for pronoun in rv._THIRD_PERSON_PRONOUNS:
        assert f"'{pronoun}'" in rules
    for noun in rv._THIRD_PERSON_NOUNS:
        assert f"'{noun}'" in rules
    for tell in rv._MACHINE_TELLS:
        assert f"'{tell}'" in rules
    for tail in rv._HOLLOW_TAILS:
        assert f"'{tail}'" in rules
