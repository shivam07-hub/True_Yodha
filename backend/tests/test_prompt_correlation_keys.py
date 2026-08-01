"""Prompt correlation keys must survive the outbound identifier filter.

`llm_provider` runs `sanitize_ai_messages` over every prompt, on every provider.
That filter rewrites UUIDs to `[REDACTED_ID]`. Any prompt that asks the model to
echo a key back has to use a key the filter cannot touch.

`project_rewrite` used a role UUID. The model dutifully echoed `[REDACTED_ID]`,
nothing matched, and every bullet kept its original — `reword_bullets` had never
reworded a bullet in production. It failed soft and logged
"N kept verbatim (guard/failsoft)", which reads like the honesty guards working.

The rule this pins: correlation keys are positional integers, never identifiers.
"""

from __future__ import annotations

from app.security.personal_data import redact_personal_data_text, sanitize_ai_messages
from app.services import project_rewrite

_ROLE_UUID = "3f2a1b4c-9d8e-4f1a-b2c3-d4e5f6a7b8c9"


def _roles() -> list[project_rewrite.RoleItems]:
    return [
        project_rewrite.RoleItems(
            key=_ROLE_UUID,
            role="Video Editor",
            company="Make My Social Media",
            items=[{"story_id": _ROLE_UUID, "text": "Edited 20+ advertisement videos."}],
        ),
        project_rewrite.RoleItems(
            key=f"story:{_ROLE_UUID}",
            role="Multimedia Head",
            company="IIT Madras",
            items=[{"story_id": _ROLE_UUID, "text": "Designed 30+ posters."}],
        ),
    ]


def test_the_prompt_survives_the_outbound_filter_unchanged():
    """The check that would have caught this on day one."""
    messages = project_rewrite._messages("Editor", "Acme", ["Video editing"], _roles())
    for original, sent in zip(messages, sanitize_ai_messages(messages)):
        assert sent["content"] == original["content"]


def test_role_uuids_never_reach_the_prompt():
    body = "".join(m["content"] for m in project_rewrite._messages("Editor", "Acme", [], _roles()))
    assert _ROLE_UUID not in body
    assert "REDACTED" not in redact_personal_data_text(body)


def test_roles_are_addressed_by_position():
    body = "".join(m["content"] for m in project_rewrite._messages("Editor", "Acme", [], _roles()))
    assert "ROLE 0:" in body
    assert "ROLE 1:" in body


def test_parse_maps_reworded_bullets_back_by_index():
    parsed = project_rewrite._parse('{"roles":[{"index":1,"bullets":["Shaped 30+ posters."]}]}')
    assert parsed == {1: ["Shaped 30+ posters."]}


def test_parse_ignores_a_non_integer_index():
    assert project_rewrite._parse('{"roles":[{"index":"[REDACTED_ID]","bullets":["x"]}]}') == {}
