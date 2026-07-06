"""User Memory Phase 4 — semantic recall (memory_semantic.retrieve).

Guards fail-soft (embed key missing / RPC error → []) and correct row mapping.
"""
from __future__ import annotations

import asyncio
from typing import Any

from app.services import memory_semantic as ms


class _Rpc:
    def __init__(self, rows: list[dict[str, Any]] | None, *, raise_on_exec: bool = False) -> None:
        self._rows = rows
        self._raise = raise_on_exec

    def rpc(self, _name: str, _params: dict[str, Any]) -> "_Rpc":
        return self

    def execute(self) -> Any:
        if self._raise:
            raise RuntimeError("rpc down")
        return type("R", (), {"data": self._rows})()


def _patch(monkeypatch: Any, *, embed_ok: bool = True, rows: list | None = None, rpc_raises: bool = False) -> None:
    async def _embed(_text: str) -> list[float]:
        if not embed_ok:
            raise RuntimeError("no embedding key")
        return [0.1, 0.2, 0.3]

    monkeypatch.setattr(ms.embeddings, "embed_query", _embed)
    monkeypatch.setattr(ms.embeddings, "to_pgvector", lambda v: "[0.1,0.2,0.3]")
    monkeypatch.setattr(ms, "get_supabase_admin", lambda: _Rpc(rows, raise_on_exec=rpc_raises))


def test_empty_query_returns_empty(monkeypatch: Any) -> None:
    called = {"embed": False}

    async def _embed(_t: str) -> list[float]:
        called["embed"] = True
        return [0.0]

    monkeypatch.setattr(ms.embeddings, "embed_query", _embed)
    assert asyncio.run(ms.retrieve("u1", "   ")) == []
    assert called["embed"] is False  # never even embeds a blank query


def test_embed_failure_is_fail_soft(monkeypatch: Any) -> None:
    _patch(monkeypatch, embed_ok=False)
    assert asyncio.run(ms.retrieve("u1", "remote product roles")) == []


def test_rpc_failure_is_fail_soft(monkeypatch: Any) -> None:
    _patch(monkeypatch, rpc_raises=True)
    assert asyncio.run(ms.retrieve("u1", "remote product roles")) == []


def test_maps_rows_to_hits(monkeypatch: Any) -> None:
    _patch(monkeypatch, rows=[
        {"id": "m1", "kind": "work_mode", "text": "Prefers remote", "similarity": 0.91},
        {"id": "m2", "kind": "note", "text": "", "similarity": 0.4},  # blank text dropped
    ])
    hits = asyncio.run(ms.retrieve("u1", "can I work from home?"))
    assert len(hits) == 1
    assert hits[0].kind == "work_mode"
    assert hits[0].text == "Prefers remote"
    assert hits[0].similarity == 0.91


def test_embed_and_store_noops_on_blank() -> None:
    # No memory_id / text → no-op, no exception.
    asyncio.run(ms.embed_and_store("u1", "", "x"))
    asyncio.run(ms.embed_and_store("u1", "m1", "  "))
