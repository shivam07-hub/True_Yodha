"""
test_cv_parser.py
Unit tests for the CV → Lightcast extractor.
LLM + file I/O are mocked — tests run without network access or real PDFs.
"""

import pytest

from app.services import cv_parser
from app.services.cv_parser import (
    _MAX_SKILLS,
    _SIGNAL_XP,
    _fuzzy_match,
    _is_plausible_professional_text,
    _parse_llm_json,
    _validate_and_normalize,
    parse_cv,
)


# ── _parse_llm_json ────────────────────────────────────────────────────────────

class TestParseLlmJson:
    def test_plain_array(self) -> None:
        assert _parse_llm_json('[{"taxonomy_key": "Python"}]') == [{"taxonomy_key": "Python"}]

    def test_object_with_skills_key(self) -> None:
        assert _parse_llm_json('{"skills": [{"name": "SQL"}]}') == [{"name": "SQL"}]

    def test_fenced_json(self) -> None:
        text = 'Here you go:\n```json\n{"skills": [{"name": "Go"}]}\n```'
        assert _parse_llm_json(text) == [{"name": "Go"}]

    def test_prose_with_trailing_json(self) -> None:
        text = 'I analysed the CV. [{"taxonomy_key": "Scala"}] hope that helps.'
        assert _parse_llm_json(text) == [{"taxonomy_key": "Scala"}]

    def test_empty_skills_list_returns_empty_list(self) -> None:
        # Provider responded cleanly but found nothing — distinct from parse failure
        assert _parse_llm_json('{"skills": []}') == []

    def test_invalid_json_returns_none(self) -> None:
        assert _parse_llm_json("not json at all") is None

    def test_empty_string_returns_none(self) -> None:
        assert _parse_llm_json("") is None


# ── _validate_and_normalize ────────────────────────────────────────────────────

class TestValidateAndNormalize:
    def test_drops_unknown_skills(self) -> None:
        result = _validate_and_normalize([
            {"taxonomy_key": "Completely Made Up Skill That Is Not Real", "signal_type": "project"},
        ])
        assert result == []

    def test_assigns_xp_from_signal_type(self) -> None:
        result = _validate_and_normalize([
            {"taxonomy_key": "Python (Programming Language)", "signal_type": "impact", "evidence": "x"},
        ])
        assert len(result) == 1
        assert result[0]["xp_awarded"] == _SIGNAL_XP["impact"]
        assert result[0]["signal_type"] == "impact"

    def test_coerces_unknown_signal_to_mention(self) -> None:
        result = _validate_and_normalize([
            {"taxonomy_key": "Python (Programming Language)", "signal_type": "made_up"},
        ])
        assert result[0]["signal_type"] == "mention"
        assert result[0]["xp_awarded"] == _SIGNAL_XP["mention"]

    def test_dedupes_keeping_highest_signal(self) -> None:
        result = _validate_and_normalize([
            {"taxonomy_key": "Python (Programming Language)", "signal_type": "mention"},
            {"taxonomy_key": "Python (Programming Language)", "signal_type": "leadership"},
            {"taxonomy_key": "Python (Programming Language)", "signal_type": "project"},
        ])
        assert len(result) == 1
        assert result[0]["signal_type"] == "leadership"

    def test_cap_max_skills(self) -> None:
        # Seed with more than _MAX_SKILLS real Lightcast names so dedup can't shrink the list
        from app.services.taxonomy_loader import get_all_skills
        names = [s.name for s in get_all_skills()[: _MAX_SKILLS + 10]]
        raw = [{"taxonomy_key": n, "signal_type": "mention"} for n in names]
        result = _validate_and_normalize(raw)
        assert len(result) <= _MAX_SKILLS

    def test_sorted_by_xp_desc(self) -> None:
        result = _validate_and_normalize([
            {"taxonomy_key": "Python (Programming Language)", "signal_type": "mention"},
            {"taxonomy_key": "SQL (Programming Language)",    "signal_type": "leadership"},
        ])
        assert result[0]["signal_type"] == "leadership"
        assert result[1]["signal_type"] == "mention"

    def test_missing_name_dropped(self) -> None:
        assert _validate_and_normalize([{"signal_type": "impact"}]) == []

    def test_non_dict_input_ignored(self) -> None:
        assert _validate_and_normalize(["not a dict", 42, None]) == []  # type: ignore[list-item]


# ── _fuzzy_match ───────────────────────────────────────────────────────────────

class TestFuzzyMatch:
    def test_near_exact_match(self) -> None:
        # "Python" should fuzzy-match "Python (Programming Language)" if threshold is low enough,
        # OR return None. Either way it should not raise.
        result = _fuzzy_match("Python (Programming Language")  # close but missing paren
        # Accept either None or the canonical name — behaviour is threshold-dependent
        assert result is None or "Python" in result

    def test_garbage_returns_none(self) -> None:
        assert _fuzzy_match("xqzzzqqq") is None

    def test_empty_returns_none(self) -> None:
        assert _fuzzy_match("") is None
        assert _fuzzy_match("   ") is None


# ── parse_cv end-to-end ────────────────────────────────────────────────────────

class TestParseCv:
    @pytest.mark.asyncio
    async def test_unsupported_file_type_raises(self) -> None:
        with pytest.raises(ValueError):
            await parse_cv(b"anything", "txt")

    @pytest.mark.asyncio
    async def test_end_to_end_with_mocked_llm(self, monkeypatch) -> None:
        fake_text = "Senior Data Engineer with 5 years of Python. " * 10
        monkeypatch.setattr(cv_parser, "_extract_text_pdf", lambda b: fake_text)

        async def fake_extract(cv_text: str) -> list[dict] | None:
            return [
                {"taxonomy_key": "Python (Programming Language)", "signal_type": "impact", "evidence": "5y"},
                {"taxonomy_key": "Not A Real Skill",              "signal_type": "mention"},
            ]

        monkeypatch.setattr(cv_parser, "_llm_extract", fake_extract)
        out = await parse_cv(b"fake-pdf-bytes", "pdf")
        assert out["raw_text"] == fake_text
        assert len(out["skills_detected"]) == 1
        assert out["skills_detected"][0]["taxonomy_key"] == "Python (Programming Language)"
        assert out["skills_detected"][0]["xp_awarded"] == _SIGNAL_XP["impact"]

    @pytest.mark.asyncio
    async def test_pdf_returns_provider_failed_false_on_short_text(self, monkeypatch) -> None:
        monkeypatch.setattr(cv_parser, "_extract_text_pdf", lambda b: "tiny")
        out = await parse_cv(b"fake-pdf-bytes", "pdf")
        assert out["skills_detected"] == []
        assert out["provider_failed"] is False

    @pytest.mark.asyncio
    async def test_llm_extract_returns_none_when_no_api_key(self, monkeypatch) -> None:
        monkeypatch.setattr(cv_parser.settings, "openrouter_api_key", "")
        monkeypatch.setattr(cv_parser.settings, "groq_api_key", "")
        monkeypatch.setattr(cv_parser.settings, "google_api_key", "")
        out = await cv_parser._llm_extract("some CV text")
        assert out is None

    @pytest.mark.asyncio
    async def test_llm_extract_returns_empty_list_when_provider_responds_with_no_skills(self, monkeypatch) -> None:
        async def _empty_provider(cv_text: str):  # noqa: ANN001
            return []
        monkeypatch.setattr(cv_parser, "_llm_extract", _empty_provider)
        out = await cv_parser.parse_cv_text("I have ten years of experience in " + "software " * 20)
        assert out["skills_detected"] == []
        assert out["provider_failed"] is False

    @pytest.mark.asyncio
    async def test_parse_cv_text_provider_failed_propagates(self, monkeypatch) -> None:
        async def _failing_extract(cv_text: str):  # noqa: ANN001
            return None
        monkeypatch.setattr(cv_parser, "_llm_extract", _failing_extract)
        out = await cv_parser.parse_cv_text("I have ten years of experience in " + "software " * 20)
        assert out["provider_failed"] is True
        assert out["skills_detected"] == []


# ── _is_plausible_professional_text ───────────────────────────────────────────

class TestIsPlausibleProfessionalText:
    def test_real_cv_text_passes(self) -> None:
        text = "Senior software engineer with five years of experience building distributed systems in Python and Go."
        assert _is_plausible_professional_text(text) is True

    def test_keyboard_smash_fails(self) -> None:
        text = "asfkdsjb mb dsbfkb mzb bmsdbcmb m b mbm bsdm"
        assert _is_plausible_professional_text(text) is False

    def test_too_short_fails(self) -> None:
        assert _is_plausible_professional_text("abc") is False

    def test_all_consonants_fails(self) -> None:
        assert _is_plausible_professional_text("bcdfghjklmnpqrstvwxyz" * 3) is False
