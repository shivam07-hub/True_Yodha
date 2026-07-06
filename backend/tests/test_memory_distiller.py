"""User Memory Phase 2 — the behavioural distiller (memory_distiller.py).

Guards the pure core: only allowed kinds survive parse, the dismissed-fact
tombstone blocks re-derivation, batch dedup + cap hold, and a provider failure
returns None (so the caller leaves the watermark for retry).
"""
from __future__ import annotations

import asyncio
from typing import Any

from app.services import memory_distiller as md


def test_parse_facts_keeps_only_allowed_kinds() -> None:
    text = """[
      {"kind": "work_mode", "text": "Prefers remote work"},
      {"kind": "target_company", "text": "Targeting fintech firms"},
      {"kind": "target_role", "text": "Wants to be a PM"},
      {"kind": "note", "text": ""},
      "garbage"
    ]"""
    facts = md.parse_facts(text)
    kinds = [f["kind"] for f in facts]
    assert kinds == ["work_mode", "target_company"]  # role dropped (not allowed), blank dropped


def test_parse_facts_strips_json_fence() -> None:
    fenced = '```json\n[{"kind":"preference","text":"Avoids early-stage startups"}]\n```'
    assert md.parse_facts(fenced) == [{"kind": "preference", "text": "Avoids early-stage startups"}]


def test_parse_facts_junk_returns_empty() -> None:
    assert md.parse_facts("I could not find anything.") == []
    assert md.parse_facts("") == []


def test_select_new_respects_tombstone_and_dedupes() -> None:
    # "Prefers remote work" already exists (active or dismissed → same fingerprint).
    existing = {md._fingerprint("work_mode", "Prefers Remote Work!")}
    candidates = [
        {"kind": "work_mode", "text": "prefers remote work"},   # tombstoned → drop
        {"kind": "salary", "text": "Targets 30 LPA"},           # new → keep
        {"kind": "salary", "text": "targets 30 lpa"},           # dup within batch → drop
    ]
    fresh = md.select_new(candidates, existing)
    assert fresh == [{"kind": "salary", "text": "Targets 30 LPA"}]


def test_select_new_caps_batch() -> None:
    many = [{"kind": "note", "text": f"fact {i}"} for i in range(20)]
    assert len(md.select_new(many, set())) == md._MAX_NEW_FACTS


def test_build_messages_labels_signals() -> None:
    msgs = md.build_messages({"saved": ["MLE @ Acme"], "dismissed": [], "searches": ["remote data jobs"]})
    user = msgs[1]["content"]
    assert "Saved (liked): MLE @ Acme" in user
    assert "Dismissed (disliked): none" in user
    assert "Searched: remote data jobs" in user


def test_distill_returns_none_on_provider_failure() -> None:
    from app.services.llm_provider import LLMProviderError

    class _DeadProvider:
        async def complete(self, *_a: Any, **_k: Any) -> str:
            raise LLMProviderError("budget dry")

    out = asyncio.run(md.distill({"saved": ["x"]}, set(), _DeadProvider()))
    assert out is None  # caller must NOT advance the watermark


def test_distill_returns_deduped_new_facts() -> None:
    class _Provider:
        async def complete(self, *_a: Any, **_k: Any) -> str:
            return '[{"kind":"work_mode","text":"Prefers hybrid"},{"kind":"note","text":"seen"}]'

    existing = {md._fingerprint("note", "seen")}
    out = asyncio.run(md.distill({"saved": ["x"]}, existing, _Provider()))
    assert out == [{"kind": "work_mode", "text": "Prefers hybrid"}]
