"""career_projection — requirement-based ranking, relevance-gated selection,
guarded reword, CV composition."""
import asyncio

from app.services import career_projection as cp
from app.services import project_rewrite


def _run(coro):
    return asyncio.run(coro)


def _story(sid, role_id=None, skills=(), metrics=(), status="active"):
    return {
        "id": sid, "role_id": role_id, "kind": "project", "title": f"Story {sid}",
        "skills": list(skills), "metrics": list(metrics), "status": status,
        "narrative": {},
    }


# ── ranking ────────────────────────────────────────────────────────────────────

def test_score_story_sums_above_floor_cosines():
    # req A = [1,0], req B = [0,1]. Story aligned with A only credits A.
    reqs = [[1.0, 0.0], [0.0, 1.0]]
    assert cp.score_story([1.0, 0.0], reqs) == 1.0
    # a diagonal story scores ~0.707 to each → both credited (> REL_FLOOR 0.30)
    diag = cp.score_story([1.0, 1.0], reqs)
    assert 1.3 < diag < 1.5
    # orthogonal-to-everything noise floored out
    assert cp.score_story([0.0, 0.0, 1.0], [[1.0, 0.0, 0.0]]) == 0.0
    assert cp.score_story(None, reqs) == 0.0
    assert cp.score_story([1.0, 0.0], []) == 0.0


def test_rank_stories_orders_by_requirement_relevance_and_excludes_archived():
    reqs = [[1.0, 0.0]]
    vecs = {"hit": [1.0, 0.0], "mid": [0.6, 0.8], "miss": [0.0, 1.0]}
    stories = [
        _story("miss", skills=["x"]),
        _story("hit", skills=["y"]),
        _story("mid", skills=["z"]),
        _story("arch", status="archived"),
    ]
    ranked = cp.rank_stories(stories, vecs, reqs)
    ids = [s["id"] for s, _ in ranked]
    assert ids[:2] == ["hit", "mid"]      # relevance order
    assert "arch" not in ids              # archived excluded
    assert ids[-1] == "miss"              # below floor → 0


def test_rank_stories_metric_bonus_breaks_ties_and_fallback_when_no_reqs():
    # No requirement vectors (parse failure) → all score 0; metric bonus orders.
    stories = [_story("plain"), _story("quant", metrics=[{"value": "50%"}])]
    ranked = cp.rank_stories(stories, {}, [])
    assert [s["id"] for s, _ in ranked] == ["quant", "plain"]


# ── selection (relevance-gated + tight) ─────────────────────────────────────────

def test_select_drops_low_relevance_role_when_signal_present():
    # Role A relevant, role B irrelevant (0.0). With real signal, B is gated out —
    # the projection stays tight rather than guaranteeing every role a bullet.
    ranked = [(_story("a0", role_id="A"), 0.9), (_story("b0", role_id="B"), 0.0)]
    included, parked = cp.select_stories(ranked)
    assert {s["id"] for s in included} == {"a0"}
    assert {s["id"] for s in parked} == {"b0"}


def test_select_keeps_forced_current_role_even_if_low_relevance():
    ranked = [(_story("a0", role_id="A"), 0.9), (_story("b0", role_id="B"), 0.0)]
    included, _ = cp.select_stories(ranked, force_role_ids={"B"})
    assert {s["id"] for s in included} == {"a0", "b0"}


def test_select_no_signal_keeps_all_roles():
    # Degenerate: every score 0 (parse+embed failure) → don't collapse to empty;
    # every role's best story still shows.
    ranked = [(_story("a0", role_id="A"), 0.0), (_story("b0", role_id="B"), 0.0)]
    included, parked = cp.select_stories(ranked)
    assert {s["id"] for s in included} == {"a0", "b0"} and parked == []


def test_select_caps_total_per_role_and_max_roles():
    ranked = [(_story(f"a{i}", role_id="A"), 5.0 - i * 0.1) for i in range(6)]
    included, parked = cp.select_stories(ranked, total_cap=4, per_role_cap=4)
    assert len(included) == 4 and {s["id"] for s in parked} == {"a4", "a5"}

    roles = [(_story(f"r{i}", role_id=f"R{i}"), 5.0 - i) for i in range(8)]
    inc, _ = cp.select_stories(roles, max_roles=3)
    assert len({s["role_id"] for s in inc}) == 3   # only top-3 relevant roles kept


# ── composition (unchanged behaviour, text_by_story map) ────────────────────────

def test_compose_projection_shapes_cv():
    baseline = {
        "contact": {"name": "Shivam"}, "summary": "Summary text",
        "education": [{"school": "IIM L"}], "skills_line": "GTM, Python",
        "certs": ["Cert A"], "experience": [{"role": "OLD", "bullets": ["old bullet"]}],
    }
    roles = [
        {"id": "A", "kind": "work", "title": "Sales Manager", "company": "Capgemini", "date_label": "2025–"},
        {"id": "B", "kind": "education", "title": "MBA", "company": "IIM Lucknow"},
        {"id": "C", "kind": "work", "title": "No stories", "company": "Ghost"},
    ]
    included = [_story("s1", role_id="A"), _story("s2", role_id="B"), _story("s3", role_id=None)]
    text = {"s1": "Did the big thing, measured by 30%.", "s2": "Won the case comp.", "s3": "Ranked 3/1500."}
    cv = cp.compose_projection(baseline, roles, included, text)
    assert cv["experience"] == [{
        "role": "Sales Manager", "company": "Capgemini", "dates": "2025–", "location": "",
        "bullets": ["Did the big thing, measured by 30%."],
    }]
    names = [p["name"] for p in cv["projects"]]
    assert "MBA — IIM Lucknow" in names and "Story s3" in names
    assert cv["summary"] == "Summary text" and cv["certs"] == ["Cert A"]
    assert "old bullet" not in str(cv["experience"])


def test_projection_emits_the_whole_contract_even_when_sections_are_empty():
    """A projection is a storable CV, so it carries every section — empty ones
    included. Dropping empty keys made a payload that reads as present and fails
    every reader that validates the full shape."""
    baseline = {"contact": {"name": "Shivam"}}
    roles = [{"id": "A", "kind": "work", "title": "BDM", "company": "Cap"}]
    cv = cp.compose_projection(baseline, roles, [_story("s1", role_id="A")], {"s1": "Shipped it."})

    assert set(cv) == {
        "contact", "summary", "education", "experience", "projects", "skills_line", "certs",
    }
    assert cv["education"] == [] and cv["certs"] == [] and cv["summary"] is None
    assert cv["contact"]["name"] == "Shivam"


# ── guarded reword ──────────────────────────────────────────────────────────────

class _FakeProvider:
    def __init__(self, payload):
        self.payload = payload

    async def complete(self, messages, max_tokens=0):
        return self.payload


def test_reword_swaps_clean_rewrites_and_keeps_guard_failures():
    roles = [project_rewrite.RoleItems(key="A", role="BDM", company="Cap", items=[
        {"story_id": "s1", "text": "Grew revenue 30% for EMEA clients."},
        {"story_id": "s2", "text": "Cut client costs by 20%."},
    ])]
    # s1: clean reword (keeps 30% + EMEA). s2: drops the 20% → loses_metrics → keep original.
    payload = '{"roles":[{"index":0,"bullets":["Drove 30% revenue growth across EMEA accounts.","Reduced client spend materially."]}]}'
    out = _run(project_rewrite.reword_bullets(
        job_title="Sales Manager", company="Huvo", requirements=["own the sales cycle"],
        roles=roles, provider=_FakeProvider(payload),
    ))
    assert out["s1"] == "Drove 30% revenue growth across EMEA accounts."
    assert out["s2"] == "Cut client costs by 20%."   # guard tripped → verbatim


def test_reword_failsoft_keeps_all_originals_on_bad_json():
    roles = [project_rewrite.RoleItems(key="A", role="BDM", company="Cap", items=[
        {"story_id": "s1", "text": "Original line with 50+ leads."},
    ])]
    out = _run(project_rewrite.reword_bullets(
        job_title="X", company="Y", requirements=[], roles=roles, provider=_FakeProvider("not json"),
    ))
    assert out == {"s1": "Original line with 50+ leads."}


def test_reword_length_mismatch_keeps_role_verbatim():
    roles = [project_rewrite.RoleItems(key="A", role="BDM", company="Cap", items=[
        {"story_id": "s1", "text": "One."}, {"story_id": "s2", "text": "Two."},
    ])]
    payload = '{"roles":[{"index":0,"bullets":["Only one line back."]}]}'
    out = _run(project_rewrite.reword_bullets(
        job_title="X", company="Y", requirements=[], roles=roles, provider=_FakeProvider(payload),
    ))
    assert out == {"s1": "One.", "s2": "Two."}


# ── end to end ──────────────────────────────────────────────────────────────────

def test_project_for_job_ranks_by_requirements_reword_off(monkeypatch):
    async def fake_embed(texts):
        return [[1.0, 0.0]]   # one requirement vector aligned with s1
    monkeypatch.setattr(cp.embeddings, "embed_texts", fake_embed)

    baseline = {"cv_structured": {"summary": "S", "contact": {"name": "N"}}}
    roles = [{"id": "A", "kind": "work", "title": "T", "company": "C", "date_label": "May 2025 – Present"}]
    stories = [
        _story("s1", role_id="A", metrics=[{"value": "50+"}]),
        _story("s2", role_id="A"),
        _story("s3", role_id="A"),  # no pointer → excluded entirely
    ]
    pointers = [
        {"story_id": "s1", "text": "Pointer one.", "is_canonical": True},
        {"story_id": "s2", "text": "Pointer two.", "is_canonical": False},
    ]
    embeds = [{"id": "s1", "embedding": [1.0, 0.0]}, {"id": "s2", "embedding": [0.0, 1.0]}]
    out = _run(cp.project_for_job(
        user_id="u1", job={"job_title": "Sales", "company_name": "Huvo"},
        requirements=["own the full sales cycle"], baseline=baseline, roles=roles,
        stories=stories, pointers=pointers, story_embeddings=embeds, reword=False,
    ))
    assert out["included_ids"][0] == "s1"                    # requirement-relevant leads
    assert "s3" not in out["included_ids"] + out["parked_ids"]
    assert out["cv_structured"]["experience"][0]["bullets"][0] == "Pointer one."
    assert out["cv_structured"]["summary"] == "S"
