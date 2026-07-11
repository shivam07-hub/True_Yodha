"""semantic_candidates.retrieve — the meaning-based job bypass. Fail-soft always:
any failure (no query, embed error, RPC error, empty/NULL-embedding corpus) → [],
so the matcher's union with the deterministic set === today's behaviour.
"""
from __future__ import annotations

import asyncio

from app.services.matching import semantic_candidates


class _RpcResp:
    def __init__(self, data):
        self.data = data


class _FakeAdmin:
    def __init__(self, rows=None, raise_on_rpc=False):
        self._rows = rows or []
        self._raise = raise_on_rpc
        self.calls: list[dict] = []

    def rpc(self, name, params):
        self.calls.append({"name": name, "params": params})
        admin = self

        class _Q:
            def execute(self_inner):
                if admin._raise:
                    raise RuntimeError("pg down")
                return _RpcResp(admin._rows)

        return _Q()


PROFILE = {"target_role_titles": ["Data Scientist"], "cv_markdown": "python, sql"}


def _run(coro):
    return asyncio.run(coro)


def test_empty_query_returns_empty(monkeypatch) -> None:
    # No intent + no CV → nothing to embed, never touches the network.
    assert _run(semantic_candidates.retrieve({})) == []


def test_embed_failure_is_soft(monkeypatch) -> None:
    async def _boom(_q):
        raise RuntimeError("no embedding key")
    monkeypatch.setattr(semantic_candidates.embeddings, "embed_query", _boom)
    assert _run(semantic_candidates.retrieve(PROFILE)) == []


def test_rpc_failure_is_soft(monkeypatch) -> None:
    async def _vec(_q):
        return [0.1] * 768
    monkeypatch.setattr(semantic_candidates.embeddings, "embed_query", _vec)
    monkeypatch.setattr(semantic_candidates.embeddings, "to_pgvector", lambda v: "[...]")
    monkeypatch.setattr(semantic_candidates, "get_supabase_admin", lambda: _FakeAdmin(raise_on_rpc=True))
    assert _run(semantic_candidates.retrieve(PROFILE)) == []


def test_happy_path_returns_ordered_ids(monkeypatch) -> None:
    async def _vec(_q):
        return [0.1] * 768
    admin = _FakeAdmin(rows=[
        {"job_id": "j1", "similarity": 0.92},
        {"job_id": "j2", "similarity": 0.81},
    ])
    monkeypatch.setattr(semantic_candidates.embeddings, "embed_query", _vec)
    monkeypatch.setattr(semantic_candidates.embeddings, "to_pgvector", lambda v: "[...]")
    monkeypatch.setattr(semantic_candidates, "get_supabase_admin", lambda: admin)
    ids = _run(semantic_candidates.retrieve(PROFILE, countries=["India"], k=50))
    assert ids == ["j1", "j2"]
    # Location is a hard filter, passed to the RPC; query embedded once.
    assert admin.calls[0]["params"]["p_countries"] == ["India"]
    assert admin.calls[0]["params"]["match_count"] == 50


def test_build_query_leads_with_intent() -> None:
    q = semantic_candidates.build_query({
        "target_role_titles": ["ML Engineer"],
        "known_facts": ["wants remote", "fintech"],
        "cv_markdown": "5y python",
    })
    assert q.index("ML Engineer") < q.index("5y python")  # intent before background
    assert "wants remote" in q
