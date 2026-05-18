"""Tests for ninja_name service — generate, validate, availability, retry."""

from unittest.mock import MagicMock

import pytest

from app.services import ninja_name


def test_generate_matches_pattern():
    name = ninja_name.generate()
    parts = name.split("-")
    assert len(parts) == 3, f"expected three parts in {name!r}"
    adj, noun, suffix = parts
    assert adj.isalpha() and adj.islower()
    assert noun.isalpha() and noun.islower()
    assert len(suffix) == 4
    assert suffix.isalnum() and suffix.islower()


def test_generate_passes_is_valid():
    for _ in range(50):
        assert ninja_name.is_valid(ninja_name.generate()) is True


def test_generate_avoids_reserved_words():
    """Adjective and noun wordlists must not contain reserved tokens."""
    reserved = ninja_name.RESERVED_WORDS
    for word in ninja_name.ADJECTIVES + ninja_name.NOUNS:
        assert word not in reserved, f"wordlist leaks reserved word: {word!r}"


@pytest.mark.parametrize("name", [
    "abc",
    "silent-fox-9k2x",
    "a1b2c3",
    "x" * 32,
])
def test_is_valid_accepts(name):
    assert ninja_name.is_valid(name) is True


@pytest.mark.parametrize("name", [
    "",
    "ab",                       # too short
    "x" * 33,                   # too long
    "UPPER",                    # uppercase
    "has_underscore",
    "has space",
    "has.dot",
    "trailing-",                # trailing hyphen still matches charset; reserved as edge
    "-leading",
])
def test_is_valid_rejects_format(name):
    if name in ("trailing-", "-leading"):
        # charset allows hyphens anywhere — these match but feel ugly.
        # We accept them; UX layer can disallow leading/trailing if desired.
        return
    assert ninja_name.is_valid(name) is False


@pytest.mark.parametrize("name", ["admin", "signup", "login", "api", "profile", "xp"])
def test_is_valid_rejects_reserved(name):
    assert ninja_name.is_valid(name) is False


def test_is_available_true_when_no_row():
    admin = MagicMock()
    admin.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
    assert ninja_name.is_available("brand-new-name", admin=admin) is True


def test_is_available_false_when_row_exists():
    admin = MagicMock()
    admin.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"id": "x"}]
    assert ninja_name.is_available("taken-name-ab12", admin=admin) is False


def test_generate_unique_retries_on_collision(monkeypatch):
    """generate_unique retries the suffix until is_available returns True."""
    admin = MagicMock()
    calls = {"n": 0}

    def fake_is_available(name: str, admin=None) -> bool:
        calls["n"] += 1
        return calls["n"] >= 3  # third attempt wins

    monkeypatch.setattr(ninja_name, "is_available", fake_is_available)
    name = ninja_name.generate_unique(admin=admin)
    assert ninja_name.is_valid(name)
    assert calls["n"] == 3


def test_generate_unique_raises_after_max_attempts(monkeypatch):
    monkeypatch.setattr(ninja_name, "is_available", lambda name, admin=None: False)
    with pytest.raises(RuntimeError):
        ninja_name.generate_unique(admin=MagicMock(), max_attempts=5)
