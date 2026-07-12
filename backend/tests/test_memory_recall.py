"""memory_recall — the one read seam over stories + facts + connections."""
import asyncio

from app.services import memory_recall


class _FakeReservoirRepo:
    def __init__(self, vecs, stories):
        self._vecs = vecs
        self._stories = stories

    def story_embeddings(self, user_id):
        return self._vecs

    def list_stories(self, user_id, *, include_archived=False):
        return self._stories


class _FakeConnRepo:
    def find_at_company(self, user_id, company, limit=5):
        return [{"full_name": "Asha Rao", "company": company, "position": "Data Lead"}]


def _patch_common(monkeypatch, vecs, stories):
    async def _embed(_q):
        return [1.0, 0.0]

    monkeypatch.setattr(memory_recall.embeddings, "embed_query", _embed)
    monkeypatch.setattr(memory_recall, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(
        memory_recall, "CareerReservoirRepository", lambda _db: _FakeReservoirRepo(vecs, stories)
    )


def test_recall_stories_ranks_by_cosine(monkeypatch):
    _patch_common(
        monkeypatch,
        vecs=[{"id": "s1", "embedding": "[1.0, 0.0]"}, {"id": "s2", "embedding": "[0.0, 1.0]"}],
        stories=[
            {"id": "s1", "title": "Grew pipeline", "narrative": {"result": "50+ reqs"}, "skills": ["GTM"]},
            {"id": "s2", "title": "Shipped dashboards", "narrative": {}, "skills": []},
        ],
    )
    hits = asyncio.run(memory_recall.recall_stories("u1", "sales pipeline growth", k=2))
    assert [h.id for h in hits] == ["s1", "s2"]
    assert hits[0].result == "50+ reqs"
    assert hits[0].similarity > hits[1].similarity


def test_recall_stories_failsoft_on_embed_error(monkeypatch):
    async def _boom(_q):
        raise RuntimeError("no key")

    monkeypatch.setattr(memory_recall.embeddings, "embed_query", _boom)
    assert asyncio.run(memory_recall.recall_stories("u1", "anything")) == []


def test_recall_stories_empty_query_short_circuits():
    assert asyncio.run(memory_recall.recall_stories("u1", "  ")) == []


def test_recall_bundle_includes_connections_for_company(monkeypatch):
    _patch_common(monkeypatch, vecs=[], stories=[])

    async def _no_facts(_uid, _q, k=4):
        return []

    monkeypatch.setattr(memory_recall.memory_semantic, "retrieve", _no_facts)
    monkeypatch.setattr(memory_recall, "ConnectionsRepository", lambda _db: _FakeConnRepo())
    bundle = asyncio.run(memory_recall.recall("u1", "data roles", company="3M"))
    assert bundle.stories == [] and bundle.facts == []
    assert bundle.connections[0]["full_name"] == "Asha Rao"


def test_story_grounding_block_renders_and_empties():
    hits = [memory_recall.StoryHit(
        id="s1", title="Grew pipeline", pointer="", result="50+ reqs", skills=["GTM", "AI"], similarity=0.9,
    )]
    block = memory_recall.story_grounding_block(hits)
    assert "THE USER'S OWN CAREER STORIES" in block
    assert "Grew pipeline" in block and "50+ reqs" in block and "GTM" in block
    assert memory_recall.story_grounding_block([]) == ""
