"""career_projection — deterministic story ranking, selection, CV composition."""
from app.services import career_projection as cp


def _story(sid, role_id=None, skills=(), metrics=(), status="active"):
    return {
        "id": sid, "role_id": role_id, "kind": "project", "title": f"Story {sid}",
        "skills": list(skills), "metrics": list(metrics), "status": status,
        "narrative": {},
    }


def test_rank_stories_weights_primary_over_secondary_and_metric_bonus():
    stories = [
        _story("a", skills=["python"]),                       # secondary hit → 1.0
        _story("b", skills=["gtm"]),                          # primary hit → 2.0
        _story("c", skills=["gtm"], metrics=[{"value": "5%"}]),  # 2.5
        _story("d", skills=["unrelated"]),                    # 0
        _story("e", skills=["gtm"], status="archived"),       # excluded
    ]
    ranked = cp.rank_stories(stories, ["GTM"], ["Python"])
    ids = [s["id"] for s, _ in ranked]
    assert ids[:3] == ["c", "b", "a"]
    assert "e" not in ids
    scores = {s["id"]: score for s, score in ranked}
    assert scores["c"] == 2.5 and scores["b"] == 2.0 and scores["a"] == 1.0 and scores["d"] == 0.0


def test_select_stories_caps_and_role_guarantee():
    # 6 strong stories in role A, 1 weak story in role B — B's best must survive.
    ranked = [(_story(f"a{i}", role_id="A", skills=["x"]), 5.0 - i * 0.1) for i in range(6)]
    ranked.append((_story("b0", role_id="B"), 0.0))
    included, parked = cp.select_stories(ranked, total_cap=4, per_role_cap=4)
    inc_ids = {s["id"] for s in included}
    assert "b0" in inc_ids                      # role guarantee
    assert len([i for i in inc_ids if i.startswith("a")]) == 4
    assert {s["id"] for s in parked} == {"a4", "a5"}


def test_select_stories_per_role_cap():
    ranked = [(_story(f"a{i}", role_id="A"), 5.0) for i in range(6)]
    included, parked = cp.select_stories(ranked, total_cap=12, per_role_cap=3)
    assert len(included) == 3 and len(parked) == 3


def test_compose_projection_shapes_cv():
    baseline = {
        "contact": {"name": "Shivam"},
        "summary": "Summary text",
        "education": [{"school": "IIM L"}],
        "skills_line": "GTM, Python",
        "certs": ["Cert A"],
        "experience": [{"role": "OLD", "bullets": ["old bullet"]}],
    }
    roles = [
        {"id": "A", "kind": "work", "title": "Sales Manager", "company": "Capgemini", "date_label": "2025–"},
        {"id": "B", "kind": "education", "title": "MBA", "company": "IIM Lucknow"},
        {"id": "C", "kind": "work", "title": "No stories", "company": "Ghost"},
    ]
    included = [
        _story("s1", role_id="A"),
        _story("s2", role_id="B"),
        _story("s3", role_id=None),
    ]
    pointers = {"s1": "Did the big thing, measured by 30%.", "s2": "Won the case comp.", "s3": "Ranked 3/1500."}
    cv = cp.compose_projection(baseline, roles, included, pointers)

    assert cv["experience"] == [{
        "role": "Sales Manager", "company": "Capgemini", "dates": "2025–",
        "bullets": ["Did the big thing, measured by 30%."],
    }]
    names = [p["name"] for p in cv["projects"]]
    assert "MBA — IIM Lucknow" in names          # education role renders as project block
    assert "Story s3" in names                   # role-less story
    # master's non-story sections carry over; old experience does NOT leak through
    assert cv["summary"] == "Summary text"
    assert cv["certs"] == ["Cert A"]
    assert "old bullet" not in str(cv["experience"])


def test_project_for_job_end_to_end_pure():
    baseline = {"cv_structured": {"summary": "S", "contact": {"name": "N"}}}
    roles = [{"id": "A", "kind": "work", "title": "T", "company": "C", "date_label": ""}]
    stories = [
        _story("s1", role_id="A", skills=["gtm"], metrics=[{"value": "50+"}]),
        _story("s2", role_id="A", skills=["nothing"]),
        _story("s3", role_id="A"),  # no pointer → excluded entirely
    ]
    pointers = [
        {"story_id": "s1", "text": "Pointer one.", "is_canonical": True},
        {"story_id": "s2", "text": "Pointer two.", "is_canonical": False},  # variant fallback
    ]
    job = {"main_skills": ["GTM"], "side_skills": []}
    out = cp.project_for_job(
        user_id="u1", job=job, baseline=baseline,
        roles=roles, stories=stories, pointers=pointers,
    )
    assert out["included_ids"][0] == "s1"
    assert "s3" not in out["included_ids"] + out["parked_ids"]
    bullets = out["cv_structured"]["experience"][0]["bullets"]
    assert bullets[0] == "Pointer one."
    assert out["cv_structured"]["summary"] == "S"
