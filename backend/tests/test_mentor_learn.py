"""learned[] — what Myro takes away from one turn the user just typed.

The gap this closes: memory was read by twelve modules and written by two, so a
user could spend an hour on the CV surface explaining themselves and Myro would
end it knowing what it knew at the start. The distiller did read their
brain-dump entries — on `/home`, debounced 12h, gated on three BEHAVIOURAL
signals with facts excluded from the count. Someone who talks and does not click
qualified for nothing.

The load-bearing test here is the last one. Lock 5 lets memory write freely and
makes anything the matcher ranks on wait for the user's accept; if this module
ever learns its way into a `user_profiles` column, a passing conversation
silently re-ranks the market and the pre-flight's Discard stops meaning discard.
"""

from __future__ import annotations

import asyncio

import pytest

from app.services import mentor_learn
from app.services.memory_distiller import _fingerprint


class _Provider:
    def __init__(self, raw: str | Exception) -> None:
        self._raw = raw
        self.calls = 0

    async def complete(self, _messages, **_kw) -> str:
        self.calls += 1
        if isinstance(self._raw, Exception):
            raise self._raw
        return self._raw


def _learn(raw, text="I have decided I do not want to manage people again, ever, after the last two years of it.", existing=None):
    return asyncio.run(
        mentor_learn.learn(text, "CV", existing or set(), _Provider(raw))
    )


def test_a_short_turn_never_reaches_the_model() -> None:
    """"ok", "add python" — nothing durable, and an LLM call per keystroke-sized
    entry is waste on a path the user is waiting on."""
    provider = _Provider('[{"kind":"constraint","text":"Avoids managing people"}]')
    out = asyncio.run(mentor_learn.learn("add python", "CV", set(), provider))
    assert out == []
    assert provider.calls == 0


def test_a_real_turn_becomes_facts() -> None:
    out = _learn('[{"kind":"constraint","text":"Avoids managing people"}]')
    assert out == [{"kind": "constraint", "text": "Avoids managing people"}]


def test_a_provider_failure_is_not_an_empty_answer() -> None:
    """None means "could not look", [] means "nothing to learn". A caller that
    confuses them either retries forever or never retries."""
    from app.services.llm_provider import LLMProviderError

    assert _learn(LLMProviderError("budget dry")) is None


def test_nothing_to_learn_is_a_real_answer() -> None:
    assert _learn("[]") == []


def test_a_fact_the_user_already_has_is_not_written_twice() -> None:
    existing = {_fingerprint("constraint", "Avoids managing people")}
    assert _learn('[{"kind":"constraint","text":"avoids  managing People."}]', existing=existing) == []


def test_a_dismissed_fact_is_never_rederived() -> None:
    """`_existing_fingerprints` reads active AND dismissed rows, so a fact the
    user threw away is a tombstone. Learning it back from the next turn would
    make dismissal feel broken."""
    existing = {_fingerprint("preference", "Prefers remote work")}
    assert _learn('[{"kind":"preference","text":"Prefers remote work"}]', existing=existing) == []


def test_one_turn_cannot_flood_the_store() -> None:
    """A turn that yields six durable facts is a model padding, not a user
    confiding."""
    raw = "[" + ",".join(
        f'{{"kind":"note","text":"Fact number {i}"}}' for i in range(9)
    ) + "]"
    assert len(_learn(raw)) <= 3


def test_an_invented_kind_is_dropped_not_coerced() -> None:
    """Reuses the distiller's allow-list. A new kind means a new store nothing
    reads, which is worse than losing the fact."""
    out = _learn('[{"kind":"target_role","text":"Wants to be a CTO"},'
                 '{"kind":"aspiration","text":"Wants to lead a platform team"}]')
    assert out == [{"kind": "aspiration", "text": "Wants to lead a platform team"}]


def test_the_turn_is_labelled_with_where_it_was_said() -> None:
    messages = mentor_learn.build_messages("I led the payments migration.", "notebook")
    assert messages[0]["role"] == "system"
    assert "notebook" in messages[1]["content"]
    assert "I led the payments migration." in messages[1]["content"]


def test_it_may_write_memory_and_nothing_else() -> None:
    """LOCK 5. Memory is generous; targeting is deliberate. This module must never
    reach a `user_profiles` column — a fact learned in passing that silently
    re-ranks the market is the failure the propose-only lock exists to prevent,
    and cached verdicts make it permanent.
    """
    import ast
    import inspect

    # Executable code only. The module's own docstring names these constants in
    # order to say it never touches them, and a test that cannot tell an
    # instruction from a description would have failed on the promise itself.
    tree = ast.parse(inspect.getsource(mentor_learn))
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if node.body and isinstance(node.body[0], ast.Expr) and isinstance(node.body[0].value, ast.Constant):
                if isinstance(node.body[0].value.value, str):
                    node.body.pop(0)
    src = ast.unparse(tree)

    for forbidden in (
        "update_profile",
        "user_profiles",
        "deal_breakers",
        "target_role_titles",
        "target_locations",
        "save_target",
        "replace_authored_leans",
    ):
        assert forbidden not in src, f"mentor_learn touches {forbidden} — lock 5 says it may not"
    assert "UserMemoryRepository" in src


@pytest.mark.parametrize("source_arg", ['source="distilled"'])
def test_a_learned_fact_is_myros_reading_not_the_users_claim(source_arg: str) -> None:
    """`authored` means the user typed this AS a fact. Myro inferring it from
    prose is `distilled`, so the memory panel shows it as something Myro thinks
    and the user can throw it away."""
    import inspect

    assert source_arg in inspect.getsource(mentor_learn._run)
