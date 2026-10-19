"""The conftest guard holds: inside a test, no paid model key is set.

If this fails, a test can spend real provider money on a laptop with a `.env`
and pass there while CI, which has no keys, fails.
"""
from __future__ import annotations

import os

from app.config import settings
from tests.conftest import _LLM_KEY_ENV, _LLM_KEY_FIELDS


def test_no_paid_model_key_is_visible_to_a_test() -> None:
    assert {field: getattr(settings, field) for field in _LLM_KEY_FIELDS} == dict.fromkeys(_LLM_KEY_FIELDS, "")
    assert [name for name in _LLM_KEY_ENV if os.environ.get(name)] == []
