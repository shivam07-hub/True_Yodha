"""Unit tests for cv_merge (bullet-pair merge) + the cv_skill_edit merge mutator.

Mirrors test_cv_rewrite.py's fake-provider pattern — the merge reuses the exact
same no-DELETION / no-substance-loss / no-fabrication guards, just applied to a
concatenated source (both bullets must survive into the merge).
"""
import asyncio
from dataclasses import dataclass

import pytest

from app.services import cv_merge, cv_skill_edit
from app.services.mentor_grounding import MentorGrounding


@dataclass
class _Passage:
    chunk_text: str
    source_title: str
    source_id: str = "myro-cv-playbook-v1"
    source_url: str | None = None
    similarity: float = 0.9


class _FakeProvider:
    def __init__(self, text="Sold $500K of GCP, AWS, and Azure platforms to enterprise clients"):
        self._text = text
        self.last_messages = None

    async def complete(self, messages, max_tokens=0, temperature=None):
        self.last_messages = messages
        return self._text


class _DeadProvider:
    async def complete(self, messages, max_tokens=0, temperature=None):
        raise cv_merge.LLMProviderError("all providers down")


def _grounding(passages=None) -> MentorGrounding:
    return MentorGrounding(passages=passages or [], stories=[], candidate_metrics=[])


def _patch_grounding(monkeypatch, grounding: MentorGrounding):
    async def fake_assemble(query, *, user_id=None, shelf="cv", passage_k=3, story_k=3):
        return grounding

    monkeypatch.setattr(cv_merge.mentor_grounding, "assemble", fake_assemble)


_BULLET_A = "Generated over $500K in sales of GCP, AWS, and Azure platforms to clients."
_BULLET_B = "Sold approximately 500K dollar worth of GCP, Azure, AWS solutions to clients"


# ── suggest_merge ─────────────────────────────────────────────────────────────


def test_suggest_merge_combines_two_bullets(monkeypatch):
    _patch_grounding(monkeypatch, _grounding())
    out = asyncio.run(cv_merge.suggest_merge(_BULLET_A, _BULLET_B, "Sales Manager", provider=_FakeProvider()))
    assert out["mode"] == "merge"
    assert out["merged_text"]


def test_suggest_merge_requires_both_bullets():
    out = asyncio.run(cv_merge.suggest_merge("", "something", None))
    assert out["mode"] == "error"
    out2 = asyncio.run(cv_merge.suggest_merge("something", "  ", None))
    assert out2["mode"] == "error"


def test_dead_provider_yields_graceful_error(monkeypatch):
    _patch_grounding(monkeypatch, _grounding())
    out = asyncio.run(cv_merge.suggest_merge(_BULLET_A, _BULLET_B, None, provider=_DeadProvider()))
    assert out["mode"] == "error"


def test_merge_dropping_a_number_is_offered_as_a_lossy_choice(monkeypatch):
    """Dropping the user's OWN number is their eyes-open call (Q1/Q6), not a
    refusal — the merge is offered with the dropped figure named."""
    _patch_grounding(monkeypatch, _grounding())
    weak = _FakeProvider(text="Sold cloud platforms to enterprise clients")  # dropped $500K
    out = asyncio.run(cv_merge.suggest_merge(_BULLET_A, _BULLET_B, None, provider=weak))
    assert out["mode"] == "lossy"
    assert out["merged_text"]
    assert any("500" in d for d in out["drops"])


def test_merge_dropping_substance_is_offered_as_a_lossy_choice(monkeypatch):
    """The Capgemini case: two distinct wins can't fully combine. Mentor offers
    the merge and NAMES what it would cost, rather than dead-ending."""
    _patch_grounding(monkeypatch, _grounding())
    src_a = (
        "Delivered €500K+ revenue last year by shaping India Cloud B2B GTM strategy "
        "for GCC clients, aligning India insights with global MNCs."
    )
    src_b = "Delivered a cross-BU pitch for Life Sciences, Energy, and Aerospace clients."
    thin = _FakeProvider(text="Generated €500K+ revenue by shaping India Cloud B2B GTM strategy")
    out = asyncio.run(cv_merge.suggest_merge(src_a, src_b, None, provider=thin))
    assert out["mode"] == "lossy"
    assert out["merged_text"]
    dropped = " ".join(out["drops"])
    assert "Aerospace" in dropped and "Sciences" in dropped  # named specifics surfaced


def test_merge_inventing_a_number_is_a_hard_refusal(monkeypatch):
    """Inventing a figure neither line stated is fabrication — never the user's
    to approve (ADR-0016). A stubborn provider that re-mints on retry is refused."""
    _patch_grounding(monkeypatch, _grounding())
    a = "Improved client onboarding for GCC accounts"
    b = "Streamlined the onboarding paperwork process"
    minted = _FakeProvider(text="Improved onboarding 40% for GCC accounts")
    out = asyncio.run(cv_merge.suggest_merge(a, b, None, provider=minted))
    assert out["mode"] == "error"
    assert "invent" in out["rationale"].lower()


class _RetryProvider:
    """First draw invents a number; the second draw is clean. Verifies the (c)
    retry recovers a fabrication-free merge instead of failing on the first miss."""

    def __init__(self, first: str, second: str):
        self._draws = [first, second]

    async def complete(self, messages, max_tokens=0, temperature=None):
        return self._draws.pop(0) if self._draws else self._draws[-1]


def test_merge_retries_once_past_an_invented_number(monkeypatch):
    _patch_grounding(monkeypatch, _grounding())
    a = "Improved client onboarding for GCC accounts"
    b = "Streamlined the onboarding paperwork process"
    provider = _RetryProvider(
        first="Improved onboarding 40% for GCC accounts",           # invents 40%
        second="Streamlined and improved onboarding for GCC accounts",  # clean
    )
    out = asyncio.run(cv_merge.suggest_merge(a, b, None, provider=provider))
    assert out["mode"] == "merge"
    assert "40%" not in out["merged_text"]


def test_grounded_merge_surfaces_citations(monkeypatch):
    provider = _FakeProvider()
    _patch_grounding(monkeypatch, _grounding([
        _Passage("Combine near-duplicate wins into one strong line.", "Myro CV Playbook"),
    ]))
    out = asyncio.run(cv_merge.suggest_merge(_BULLET_A, _BULLET_B, "Sales Manager", provider=provider))
    assert out["mode"] == "merge"
    assert out["citations"] == ["Myro CV Playbook"]
    assert "Combine near-duplicate" in provider.last_messages[0]["content"]


# ── apply_bullet_merge (mutator) ──────────────────────────────────────────────


def _sample_cv() -> dict:
    return {
        "summary": "",
        "experience": [
            {
                "role": "GTM Business Development Manager",
                "company": "Capgemini",
                "dates": "2025–present",
                "bullets": [
                    "Generated over $500K in sales of GCP, AWS, and Azure platforms to clients.",
                    "Connected with clients at Capgemini to understand their cloud service needs.",
                    "Sold approximately 500K dollar worth of GCP, Azure, AWS solutions to clients.",
                ],
            },
        ],
        "projects": [],
        "education": [],
        "skills_line": "",
        "certs": [],
    }


def test_apply_bullet_merge_collapses_two_bullets_into_one():
    cv = _sample_cv()
    loc_a = cv_skill_edit.locate_bullet(cv, "", section_hint="exp_bullet", item_index=0, bullet_index=0)
    loc_c = cv_skill_edit.locate_bullet(cv, "", section_hint="exp_bullet", item_index=0, bullet_index=2)
    assert isinstance(loc_a, cv_skill_edit.BulletLocation)
    assert isinstance(loc_c, cv_skill_edit.BulletLocation)

    new_cv = cv_skill_edit.apply_bullet_merge(cv, loc_a, loc_c, "Sold $500K+ of GCP, AWS, and Azure to enterprise clients.")

    bullets = new_cv["experience"][0]["bullets"]
    assert len(bullets) == 2  # 3 → 2
    assert bullets[0] == "Sold $500K+ of GCP, AWS, and Azure to enterprise clients."
    assert bullets[1] == "Connected with clients at Capgemini to understand their cloud service needs."
    # Original untouched
    assert len(cv["experience"][0]["bullets"]) == 3


def test_apply_bullet_merge_order_independent():
    """Passing the higher index first must still land the merged text at the
    lower slot and drop the higher — the frontend doesn't guarantee order."""
    cv = _sample_cv()
    loc_c = cv_skill_edit.locate_bullet(cv, "", section_hint="exp_bullet", item_index=0, bullet_index=2)
    loc_a = cv_skill_edit.locate_bullet(cv, "", section_hint="exp_bullet", item_index=0, bullet_index=0)
    new_cv = cv_skill_edit.apply_bullet_merge(cv, loc_c, loc_a, "Merged line.")
    assert new_cv["experience"][0]["bullets"][0] == "Merged line."
    assert len(new_cv["experience"][0]["bullets"]) == 2


def test_apply_bullet_merge_rejects_cross_item():
    cv = _sample_cv()
    cv["experience"].append({"role": "Other", "company": "X", "dates": "", "bullets": ["Something else here."]})
    loc_a = cv_skill_edit.locate_bullet(cv, "", section_hint="exp_bullet", item_index=0, bullet_index=0)
    loc_b = cv_skill_edit.locate_bullet(cv, "", section_hint="exp_bullet", item_index=1, bullet_index=0)
    with pytest.raises(ValueError):
        cv_skill_edit.apply_bullet_merge(cv, loc_a, loc_b, "x")


def test_apply_bullet_merge_rejects_self_merge():
    cv = _sample_cv()
    loc_a = cv_skill_edit.locate_bullet(cv, "", section_hint="exp_bullet", item_index=0, bullet_index=0)
    with pytest.raises(ValueError):
        cv_skill_edit.apply_bullet_merge(cv, loc_a, loc_a, "x")


def test_apply_bullet_merge_rejects_singleton_sections():
    cv = _sample_cv()
    cv["skills_line"] = "Python, SQL"
    loc = cv_skill_edit.locate_bullet(cv, cv["skills_line"])
    assert isinstance(loc, cv_skill_edit.BulletLocation)
    with pytest.raises(ValueError):
        cv_skill_edit.apply_bullet_merge(cv, loc, loc, "x")


def test_apply_bullet_merge_rejects_empty_text():
    cv = _sample_cv()
    loc_a = cv_skill_edit.locate_bullet(cv, "", section_hint="exp_bullet", item_index=0, bullet_index=0)
    loc_b = cv_skill_edit.locate_bullet(cv, "", section_hint="exp_bullet", item_index=0, bullet_index=1)
    with pytest.raises(ValueError):
        cv_skill_edit.apply_bullet_merge(cv, loc_a, loc_b, "   ")
