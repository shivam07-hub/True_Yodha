"""story_dedup — matching, fold merging, judge parse (pure helpers)."""
import pytest

from app.services import story_dedup as sd


# ── best_match / classify ────────────────────────────────────────────────────

def test_best_match_picks_highest_above_band():
    existing = [("s1", [1.0, 0.0]), ("s2", [0.9, 0.1])]
    sid, score = sd.best_match([1.0, 0.0], existing)
    assert sid == "s1" and score == pytest.approx(1.0)


def test_best_match_below_band_is_none():
    sid, score = sd.best_match([1.0, 0.0], [("s1", [0.0, 1.0])])
    assert sid is None and score == 0.0


def test_classify_thresholds():
    assert sd.classify(0.95) == "fold"
    assert sd.classify(0.90) == "fold"
    assert sd.classify(0.85) == "judge"
    assert sd.classify(0.80) == "judge"
    assert sd.classify(0.79) == "new"


# ── fold merging ─────────────────────────────────────────────────────────────

def test_pointer_is_new_normalizes():
    assert not sd.pointer_is_new("Cut costs by 20%.", ["cut  costs by 20%."])
    assert sd.pointer_is_new("Cut costs by 20% via dashboards.", ["Cut costs by 20%."])
    assert not sd.pointer_is_new("   ", [])


def test_merged_skills_unions_case_insensitive():
    out = sd.merged_skills(["GTM", "Sales"], ["gtm", "Data Analysis"])
    assert out == ["GTM", "Sales", "Data Analysis"]


def test_merged_metrics_dedup_by_value_and_what():
    existing = [{"value": "€500K+", "what": "revenue"}]
    incoming = [
        {"value": "€500k+", "what": "Revenue"},           # same → skipped
        {"value": "50+", "what": "qualified leads"},       # new
    ]
    out = sd.merged_metrics(existing, incoming)
    assert out == [
        {"value": "€500K+", "what": "revenue"},
        {"value": "50+", "what": "qualified leads"},
    ]


# ── judge parse ──────────────────────────────────────────────────────────────

def test_parse_judge_happy_path():
    raw = '[{"index": 0, "same": true}, {"index": 1, "same": false}]'
    assert sd.parse_judge(raw, 2) == [True, False]


def test_parse_judge_junk_is_all_false():
    assert sd.parse_judge("no json here", 3) == [False, False, False]
    assert sd.parse_judge('{"same": true}', 2) == [False, False]
    assert sd.parse_judge('[{"index": 9, "same": true}]', 2) == [False, False]


def test_build_judge_messages_carries_pair_texts():
    msgs = sd.build_judge_messages([{
        "new": {"title": "Proposal expansion", "pointer": "Shaped $2M+ proposals.",
                "narrative": {"result": "Grew ~200 resources."}},
        "existing": {"title": "Data & AI growth", "narrative": {"result": "$2M+ multi-year proposals."}},
    }])
    body = msgs[1]["content"]
    assert "PAIR 0" in body and "$2M+" in body and "~200" in body


class _FailingProvider:
    async def complete(self, messages, max_tokens=0):
        from app.services.llm_provider import LLMProviderError
        raise LLMProviderError("down")


class _SameProvider:
    async def complete(self, messages, max_tokens=0):
        return '[{"index": 0, "same": true}]'


@pytest.mark.asyncio
async def test_judge_pairs_fail_soft_all_false():
    pairs = [{"new": {"title": "a"}, "existing": {"title": "b"}}]
    assert await sd.judge_pairs(pairs, _FailingProvider()) == [False]


@pytest.mark.asyncio
async def test_judge_pairs_happy_path():
    pairs = [{"new": {"title": "a"}, "existing": {"title": "b"}}]
    assert await sd.judge_pairs(pairs, _SameProvider()) == [True]


@pytest.mark.asyncio
async def test_judge_pairs_empty_no_call():
    assert await sd.judge_pairs([], _FailingProvider()) == []
