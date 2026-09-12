"""story_identity — the one place 'one achievement = one story' is enforced."""
from __future__ import annotations

from typing import Any

import pytest
from postgrest.exceptions import APIError

from app.services import story_identity as si
from app.services import story_identity_rules as rules
from app.services.llm_provider import LLMProviderError


def _story(sid: str, role: str | None = None, title: str = "", **kw: Any) -> dict[str, Any]:
    return {
        "id": sid, "role_id": role, "title": title, "narrative": {},
        "metrics": kw.get("metrics", []), "skills": kw.get("skills", []),
        "inflow_ids": kw.get("inflows", []), "status": "active",
        "created_at": kw.get("created", "2026-07-13T00:00:00"),
    }


def _ptr(pid: str, sid: str, text: str, canonical: bool = True, ordering: float = 0.0) -> dict[str, Any]:
    return {"id": pid, "story_id": sid, "text": text, "is_canonical": canonical, "ordering": ordering}


# ── candidates ───────────────────────────────────────────────────────────────

def test_same_employer_family_is_a_candidate():
    stories = [_story("a", "r1"), _story("b", "r2")]
    companies = {"r1": "Capgemini", "r2": "Capgemini (Insights & Data)"}
    out = rules.candidate_pairs(stories, companies, [("a", "b", 0.65)], set())
    assert [(a, b) for a, b, _ in out] == [("a", "b")]


def test_across_employers_only_nearest_neighbours_meet():
    stories = [_story("a", "r1"), _story("b", "r2"), _story("c", "r3")]
    companies = {"r1": "Capgemini", "r2": "JLL", "r3": "Accenture"}
    sims = [("a", "c", 0.76), ("a", "b", 0.70), ("b", "c", 0.62)]
    out = rules.candidate_pairs(stories, companies, sims, set())
    assert [(a, b) for a, b, _ in out] == [("a", "c"), ("a", "b")]  # b–c is nobody's nearest


def test_a_story_with_no_role_meets_everything_above_the_floor():
    stories = [_story("a"), _story("b", "r1"), _story("c", "r2"), _story("d", "r2")]
    companies = {"r1": "JLL", "r2": "Accenture"}
    sims = [("c", "d", 0.9), ("b", "c", 0.8), ("a", "b", 0.61)]
    assert ("a", "b") in {(a, b) for a, b, _ in rules.candidate_pairs(stories, companies, sims, set())}


def test_below_the_floor_only_a_shared_title_nominates():
    stories = [_story("a", "r1", "Data Engineering"), _story("b", "r1", "data  engineering"), _story("c", "r1", "Other")]
    out = rules.candidate_pairs(stories, {"r1": "JLL"}, [("a", "c", 0.55)], set())
    assert out == [("a", "b", 0.0)]


def test_decided_pairs_never_return():
    stories = [_story("a", "r1"), _story("b", "r1")]
    assert rules.candidate_pairs(stories, {"r1": "JLL"}, [("a", "b", 0.8)], {("a", "b")}) == []


# ── rule, survivor, plans ────────────────────────────────────────────────────

def test_near_verbatim_is_identical_phrasing_or_near_identical_vectors():
    assert rules.near_verbatim(0.5, "Cut costs by 20%.", "cut  costs by 20%.")
    assert rules.near_verbatim(0.97, "a", "b")
    assert not rules.near_verbatim(0.9, "Cut costs.", "Raised revenue.")
    assert not rules.near_verbatim(0.5, "", "")


def test_the_survivor_has_more_phrasings_then_more_provenance_then_is_older():
    a, b = _story("a", created="2026-07-02"), _story("b", created="2026-07-01")
    assert rules.pick_keep(a, b, {"a": 3, "b": 1})[0]["id"] == "a"
    a2, b2 = _story("a", inflows=["e1"]), _story("b", inflows=["e1", "e2"])
    assert rules.pick_keep(a2, b2, {})[0]["id"] == "b"
    assert rules.pick_keep(a, b, {})[0]["id"] == "b"


def test_a_fold_keeps_every_new_phrasing_and_unions_the_rest():
    keep = _story("k", metrics=[{"value": "20%", "what": "cost"}], skills=["SQL"], inflows=["e1"])
    dup = _story("d", metrics=[{"value": "20%", "what": "cost"}, {"value": "€500K", "what": "rev"}],
                 skills=["sql", "Python"], inflows=["e1", "e2"])
    plan = rules.fold_plan(
        keep, dup,
        [_ptr("p1", "k", "Cut costs by 20%.")],
        [_ptr("p2", "d", "Raised €500K revenue."), _ptr("p3", "d", "cut costs by 20%.", canonical=False)],
    )
    assert plan.move_pointers == ["p2"] and plan.archive_pointers == ["p3"]
    assert plan.moved["moved_pointers"] == [{"id": "p2", "was_canonical": True}]
    assert plan.keep_skills == ["SQL", "Python"] and plan.keep_inflows == ["e1", "e2"]
    assert plan.moved["dup_added"] == {
        "metrics": [{"value": "€500K", "what": "rev"}], "skills": ["Python"], "inflow_ids": ["e2"],
    }


def test_undo_takes_back_exactly_what_the_fold_added():
    keep_now = _story("k", metrics=[{"value": "20%", "what": "cost"}, {"value": "€500K", "what": "rev"},
                                    {"value": "9", "what": "later fold"}],
                      skills=["SQL", "Python", "Go"], inflows=["e1", "e2", "e9"])
    row = {"keep_id": "k", "moved": {
        "dup_id": "d",
        "moved_pointers": [{"id": "p2", "was_canonical": True}, {"id": "p4", "was_canonical": False}],
        "archived_pointers": ["p3"],
        "dup_added": {"metrics": [{"value": "€500K", "what": "rev"}], "skills": ["Python"], "inflow_ids": ["e2"]},
    }}
    plan = rules.unfold_plan(row, keep_now)
    assert (plan.back_canonical, plan.back_variant, plan.reactivate) == (["p2"], ["p4"], ["p3"])
    assert plan.keep_metrics == [{"value": "20%", "what": "cost"}, {"value": "9", "what": "later fold"}]
    assert plan.keep_skills == ["SQL", "Go"] and plan.keep_inflows == ["e1", "e9"]


# ── judge parsing ────────────────────────────────────────────────────────────

def test_parse_judge_reads_verdicts_and_leaves_gaps_empty():
    raw = 'Sure: [{"index": 0, "verdict": "same"}, {"index": 2, "verdict": "PART_OF"}, {"index": 1, "verdict": "maybe"}]'
    assert rules.parse_judge(raw, 4) == ["same", None, "part_of", None]
    assert rules.parse_judge("no idea", 2) == [None, None]


def test_outcomes():
    assert [rules.outcome(v) for v in ("same", "part_of", "unsure", "different", None)] == [
        "fold", "proposed", "proposed", "keep_separate", None,
    ]


# ── the sweep, through the module's interface ───────────────────────────────

class FakeRepo:
    def __init__(self, stories, pointers, sims, companies=None, decided=None):
        self.rows = {s["id"]: s for s in stories}
        self.ptrs = pointers
        self.sims = sims
        self.companies = companies or {}
        self.decided = set(decided or ())
        self.verdicts: dict[rules.Pair, dict[str, Any]] = {}
        self.folds: list[tuple[rules.FoldPlan, str, str]] = []
        self.unfolds: list[rules.UnfoldPlan] = []
        self.refuse: set[str] = set()

    def active_stories(self, user_id):
        return [s for s in self.rows.values() if s["status"] == "active"]

    def stories(self, user_id, ids):
        return [self.rows[i] for i in ids if i in self.rows]

    def story(self, user_id, sid):
        return self.rows.get(sid)

    def role_companies(self, user_id):
        return self.companies

    def all_story_pointers(self, user_id):
        return list(self.ptrs)

    def story_pointers(self, user_id, ids):
        return [p for p in self.ptrs if p["story_id"] in ids]

    def similar_pairs(self, user_id, floor):
        return self.sims

    def decided_pairs(self, user_id):
        return self.decided

    def verdict(self, user_id, a, b):
        return self.verdicts.get(rules.pair_key(a, b))

    def record_verdict(self, user_id, a, b, verdict, decided_by):
        self.verdicts[rules.pair_key(a, b)] = {"verdict": verdict, "decided_by": decided_by}

    def fold(self, user_id, plan, *, verdict, decided_by):
        if plan.dup_id in self.refuse:
            raise APIError({"message": "duplicate is not an active story", "code": "P0001"})
        self.folds.append((plan, verdict, decided_by))
        self.rows[plan.dup_id]["status"] = "archived"
        self.rows[plan.keep_id].update(metrics=plan.keep_metrics, skills=plan.keep_skills, inflow_ids=plan.keep_inflows)
        self.verdicts[rules.pair_key(plan.keep_id, plan.dup_id)] = {
            "verdict": verdict, "decided_by": decided_by, "keep_id": plan.keep_id, "moved": plan.moved,
        }

    def unfold(self, user_id, plan):
        self.unfolds.append(plan)


class FakeProvider:
    def __init__(self, reply: str = "[]", error: bool = False):
        self.reply, self.error, self.calls = reply, error, 0

    async def complete(self, messages, max_tokens=4096, temperature=None):
        self.calls += 1
        if self.error:
            raise LLMProviderError("all providers failed")
        return self.reply


def _four_pairs_repo() -> FakeRepo:
    stories = [_story(x, "r1", f"Story {x}") for x in "abcdefgh"]
    pointers = [_ptr(f"p{x}", x, f"Line {x}") for x in "abcdefgh"]
    sims = [("a", "b", 0.80), ("c", "d", 0.79), ("e", "f", 0.78), ("g", "h", 0.77)]
    return FakeRepo(stories, pointers, sims, {"r1": "Capgemini"})


@pytest.mark.asyncio
async def test_each_verdict_lands_where_it_belongs():
    repo = _four_pairs_repo()
    reply = '[{"index":0,"verdict":"same"},{"index":1,"verdict":"part_of"},{"index":2,"verdict":"different"}]'
    counts = await si.run(repo, "u", provider=FakeProvider(reply))
    assert counts == {"judged": 3, "folded": 1, "proposed": 1, "kept": 1}
    assert [(p.keep_id, p.dup_id, v, by) for p, v, by in repo.folds] == [("a", "b", "auto_folded", "judge")]
    assert repo.verdicts[("c", "d")]["verdict"] == "proposed"
    assert repo.verdicts[("e", "f")]["verdict"] == "keep_separate"
    assert ("g", "h") not in repo.verdicts  # no answer → judged again next sweep


@pytest.mark.asyncio
async def test_a_judge_outage_records_nothing():
    repo = _four_pairs_repo()
    counts = await si.run(repo, "u", provider=FakeProvider(error=True))
    assert repo.verdicts == {} and repo.folds == [] and counts["judged"] == 0


@pytest.mark.asyncio
async def test_the_same_line_twice_folds_without_asking_the_judge():
    repo = FakeRepo(
        [_story("a", "r1"), _story("b", "r1")],
        [_ptr("pa", "a", "Cut costs by 20%."), _ptr("pb", "b", "cut costs by 20%.")],
        [("a", "b", 0.7)], {"r1": "JLL"},
    )
    provider = FakeProvider()
    await si.run(repo, "u", provider=provider)
    assert provider.calls == 0
    assert [(v, by) for _, v, by in repo.folds] == [("auto_folded", "rule")]


@pytest.mark.asyncio
async def test_a_story_folded_away_is_not_compared_again_in_the_same_run():
    repo = FakeRepo(
        [_story("a", "r1"), _story("b", "r1"), _story("c", "r1")],
        [_ptr("pa", "a", "Same line."), _ptr("pb", "b", "same line."), _ptr("pc", "c", "Other.")],
        [("a", "b", 0.9), ("b", "c", 0.8)], {"r1": "JLL"},
    )
    provider = FakeProvider()
    await si.run(repo, "u", provider=provider)
    assert len(repo.folds) == 1 and provider.calls == 0


@pytest.mark.asyncio
async def test_a_refused_fold_is_skipped_and_not_counted():
    repo = FakeRepo(
        [_story("a", "r1"), _story("b", "r1")],
        [_ptr("pa", "a", "Same line."), _ptr("pb", "b", "Same line.")],
        [("a", "b", 0.7)], {"r1": "JLL"},
    )
    repo.refuse = {"b"}
    counts = await si.run(repo, "u", provider=FakeProvider())
    assert counts["folded"] == 0 and repo.verdicts == {}


# ── rulings and undo ─────────────────────────────────────────────────────────

def test_keeping_both_is_a_user_ruling():
    repo = FakeRepo([_story("a"), _story("b")], [], [])
    si.decide(repo, "u", "b", "a", "keep_separate")
    assert repo.verdicts[("a", "b")] == {"verdict": "keep_separate", "decided_by": "user"}


def test_merging_folds_as_the_user_and_undo_takes_it_back():
    repo = FakeRepo(
        [_story("a", metrics=[{"value": "1", "what": "x"}]), _story("b", metrics=[{"value": "2", "what": "y"}])],
        [_ptr("pa", "a", "Line A."), _ptr("pb", "b", "Line B.")], [],
    )
    si.decide(repo, "u", "a", "b", "merged")
    plan, verdict, by = repo.folds[0]
    assert (plan.keep_id, plan.dup_id, verdict, by) == ("a", "b", "merged", "user")

    si.undo(repo, "u", "a", "b")
    back = repo.unfolds[0]
    assert back.back_canonical == ["pb"] and back.keep_metrics == [{"value": "1", "what": "x"}]


def test_merging_a_changed_pair_is_refused_with_a_reason():
    repo = FakeRepo([_story("a"), _story("b")], [], [])
    repo.rows["b"]["status"] = "archived"
    with pytest.raises(si.StoryIdentityError):
        si.decide(repo, "u", "a", "b", "merged")


def test_undo_without_a_fold_is_refused():
    with pytest.raises(si.StoryIdentityError):
        si.undo(FakeRepo([], [], []), "u", "a", "b")
