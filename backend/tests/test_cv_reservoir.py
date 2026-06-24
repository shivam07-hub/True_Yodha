"""cv_reservoir (v2) — pure explode/render core.

The load-bearing test is the round-trip IDENTITY invariant: mirroring a master into
the reservoir and rendering it back reproduces the same CV (the guarantee that the
master "always renders as a clean CV, identical to before"). Plus role isolation,
empty-bullet handling, ordering, and canonical/archived filtering (Phase-2 shape).

role_anchor is positional ("{list_key}:{index}") so the backfill is a pure additive
shadow that never mutates the live master.

Spec: memory/project_cv_experience_reservoir.md (GRILL-LOCKED 2026-06-24).
"""
from __future__ import annotations

from app.services import cv_reservoir


def _seq_ids():
    """Deterministic id factory so explode is reproducible in tests."""
    counter = iter(range(100000))
    return lambda: f"id-{next(counter)}"


def _master() -> dict:
    return {
        "summary": "Senior PM with 6 years in fintech.",
        "experience": [
            {"role": "Product Manager", "company": "Acme", "dates": "2021–2023",
             "bullets": ["Led onboarding revamp", "Shipped billing v2"]},
            {"role": "Analyst", "company": "Beta", "dates": "2019–2021",
             "bullets": ["Built the forecast model"]},
        ],
        "projects": [
            {"name": "Open-source CLI", "bullets": ["Authored the plugin system"]},
        ],
        "skills_line": "Python, SQL, Roadmapping",
        "certs": ["PMP", "AWS SAA"],
    }


# ── The invariant ─────────────────────────────────────────────────────────────

def test_roundtrip_identity_full_master():
    cv = _master()
    points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    # Clean bullets in → exact identity out (no minted ids, no header mutation).
    assert cv_reservoir.render_master(cv, points) == cv


def test_explode_does_not_mutate_input():
    cv = _master()
    cv_reservoir.explode_master(cv, new_id=_seq_ids())
    assert cv["experience"][0]["bullets"] == ["Led onboarding revamp", "Shipped billing v2"]


# ── Explode shape ─────────────────────────────────────────────────────────────

def test_explode_emits_one_point_per_nonempty_bullet():
    points = cv_reservoir.explode_master(_master(), new_id=_seq_ids())
    assert len(points) == 4  # 2 + 1 exp bullets + 1 project bullet
    assert {p["section"] for p in points} == {"exp_bullet", "proj_bullet"}
    assert all(p["source"] == "migration" and p["is_canonical"] and p["status"] == "active" for p in points)


def test_positional_anchors():
    points = cv_reservoir.explode_master(_master(), new_id=_seq_ids())
    anchors = {p["text"]: p["role_anchor"] for p in points}
    assert anchors["Led onboarding revamp"] == "experience:0"
    assert anchors["Built the forecast model"] == "experience:1"
    assert anchors["Authored the plugin system"] == "projects:0"


# ── Role isolation: identical headers must not bleed bullets ───────────────────

def test_two_identical_roles_do_not_collide():
    cv = {
        "experience": [
            {"role": "Consultant", "company": "BigCo", "dates": "2020",
             "bullets": ["Ran the cost workstream"]},
            {"role": "Consultant", "company": "BigCo", "dates": "2020",
             "bullets": ["Owned the data migration"]},
        ],
    }
    points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    rendered = cv_reservoir.render_master(cv, points)
    assert rendered["experience"][0]["bullets"] == ["Ran the cost workstream"]
    assert rendered["experience"][1]["bullets"] == ["Owned the data migration"]


# ── Empty bullets dropped (noise), ordering preserved ─────────────────────────

def test_empty_bullets_dropped():
    cv = {"experience": [{"role": "X", "company": "Y", "dates": "",
                          "bullets": ["Real one", "  ", "", "Second real"]}]}
    points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    assert len(points) == 2
    assert cv_reservoir.render_master(cv, points)["experience"][0]["bullets"] == ["Real one", "Second real"]


def test_ordering_preserved_within_role():
    cv = {"experience": [{"role": "X", "company": "Y", "dates": "",
                          "bullets": ["first", "second", "third"]}]}
    points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    assert [p["ordering"] for p in points] == [0.0, 1.0, 2.0]
    assert cv_reservoir.render_master(cv, points)["experience"][0]["bullets"] == ["first", "second", "third"]


# ── Canonical / archived filtering (Phase-2 shape: variants + curation) ────────

def test_render_uses_canonical_and_ignores_other_phrasings():
    cv = {"experience": [{"role": "X", "company": "Y", "dates": "", "bullets": ["Original line"]}]}
    points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    pk, anchor = points[0]["point_key"], points[0]["role_anchor"]
    # Append a second, non-canonical phrasing of the SAME point (Phase-2 producer).
    points.append({
        "point_key": pk, "role_anchor": anchor, "section": "exp_bullet",
        "text": "Impact-led phrasing", "audience_tags": ["consulting"],
        "source": "gap_session", "is_canonical": False, "ordering": 0.0, "status": "active",
    })
    assert cv_reservoir.render_master(cv, points)["experience"][0]["bullets"] == ["Original line"]
    # Flip canonical → the new phrasing renders instead, still one bullet.
    points[0]["is_canonical"] = False
    points[1]["is_canonical"] = True
    assert cv_reservoir.render_master(cv, points)["experience"][0]["bullets"] == ["Impact-led phrasing"]


def test_archived_point_does_not_render():
    cv = {"experience": [{"role": "X", "company": "Y", "dates": "",
                          "bullets": ["Keep me", "Archive me"]}]}
    points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    points[1]["status"] = "archived"
    assert cv_reservoir.render_master(cv, points)["experience"][0]["bullets"] == ["Keep me"]


def test_duplicate_canonical_renders_one_bullet_per_point():
    cv = {"experience": [{"role": "X", "company": "Y", "dates": "", "bullets": ["Solo point"]}]}
    points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    points.append({**points[0], "text": "Accidental dup canonical"})
    rendered = cv_reservoir.render_master(cv, points)
    assert len(rendered["experience"][0]["bullets"]) == 1


# ── build_reservoir_view: the GET /cv/reservoir grouping ──────────────────────

def _has_metric(text: str) -> bool:
    return any(ch.isdigit() for ch in text)


def test_build_view_groups_roles_points_variants():
    cv = _master()
    points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    view = cv_reservoir.build_reservoir_view(cv, points, _has_metric)

    assert view["summary"] == cv["summary"]
    assert view["certs"] == cv["certs"]
    assert [r["role_id"] for r in view["roles"]] == ["experience:0", "experience:1", "projects:0"]
    acme = view["roles"][0]
    assert acme["kind"] == "experience" and acme["title"] == "Product Manager" and acme["org"] == "Acme"
    cli = view["roles"][2]
    assert cli["kind"] == "project" and cli["title"] == "Open-source CLI" and cli["org"] is None
    # one variant per point after a fresh explode, all canonical
    assert all(len(p["variants"]) == 1 and p["variants"][0]["is_canonical"] for r in view["roles"] for p in r["points"])


def test_build_view_flags_needs_impact_on_metricless_canonical():
    cv = {"experience": [{"role": "X", "company": "Y", "dates": "",
                          "bullets": ["Cut activation time 40%", "Owned the billing migration"]}]}
    points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    pts = cv_reservoir.build_reservoir_view(cv, points, _has_metric)["roles"][0]["points"]
    by_text = {p["variants"][0]["text"]: p["needs_impact"] for p in pts}
    assert by_text["Cut activation time 40%"] is False     # has a number
    assert by_text["Owned the billing migration"] is True  # no measurable result


def test_build_view_canonical_first_and_omits_empty_roles():
    cv = {"experience": [
        {"role": "Has points", "company": "A", "dates": "", "bullets": ["Did a thing"]},
        {"role": "No points", "company": "B", "dates": "", "bullets": []},
    ]}
    points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    pk, anchor = points[0]["point_key"], points[0]["role_anchor"]
    points.append({
        "id": "alt", "point_key": pk, "role_anchor": anchor, "section": "exp_bullet",
        "text": "Alternate phrasing", "audience_tags": ["startup"], "source": "gap_session",
        "is_canonical": False, "ordering": 0.0, "status": "active",
    })
    view = cv_reservoir.build_reservoir_view(cv, points, _has_metric)
    assert len(view["roles"]) == 1                       # empty role omitted
    variants = view["roles"][0]["points"][0]["variants"]
    assert variants[0]["is_canonical"] is True           # canonical first
    assert variants[1]["text"] == "Alternate phrasing"
