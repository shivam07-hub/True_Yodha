"""cv_reservoir (v2 Phase 1) — pure explode/render core.

The load-bearing test is the round-trip IDENTITY invariant: exploding a master into
the reservoir and rendering it back reproduces the same CV (the guarantee that the
master "always renders as a clean CV, identical to before"). Plus role isolation,
empty-bullet handling, ordering, and canonical/archived filtering (Phase 2 shape).

Spec: memory/project_cv_experience_reservoir.md (GRILL-LOCKED 2026-06-24).
"""
from __future__ import annotations

from copy import deepcopy

from app.services import cv_reservoir


def _seq_ids():
    """Deterministic id factory so explode is reproducible in tests."""
    counter = iter(range(100000))
    return lambda: f"id-{next(counter)}"


def _strip_role_ids(cv: dict) -> dict:
    """Remove the invisible role_id metadata explode mints, so a rendered master can
    be compared to the original input for visible-content identity."""
    out = deepcopy(cv)
    for key in ("experience", "projects"):
        for container in out.get(key) or []:
            container.pop("role_id", None)
    return out


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
    headers, points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    rendered = cv_reservoir.render_master(headers, points)
    assert _strip_role_ids(rendered) == cv


def test_roundtrip_identity_is_stable_across_render():
    cv = _master()
    headers, points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    # Rendering twice yields the same CV (render is a pure projection).
    assert cv_reservoir.render_master(headers, points) == cv_reservoir.render_master(headers, points)


# ── Explode shape ─────────────────────────────────────────────────────────────

def test_explode_emits_one_point_per_nonempty_bullet():
    cv = _master()
    _headers, points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    assert len(points) == 4  # 2 + 1 exp bullets + 1 project bullet
    assert {p["section"] for p in points} == {"exp_bullet", "proj_bullet"}
    assert all(p["source"] == "migration" and p["is_canonical"] and p["status"] == "active" for p in points)


def test_explode_mints_role_id_and_strips_header_bullets():
    cv = _master()
    headers, _points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    for container in headers["experience"] + headers["projects"]:
        assert container["role_id"]            # minted
        assert container["bullets"] == []      # bullets moved to the reservoir


def test_explode_preserves_existing_role_id():
    cv = _master()
    cv["experience"][0]["role_id"] = "stable-role-7"
    headers, points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    assert headers["experience"][0]["role_id"] == "stable-role-7"
    assert all(p["role_anchor"] == "stable-role-7"
               for p in points if p["text"] in ("Led onboarding revamp", "Shipped billing v2"))


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
    headers, points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    rendered = cv_reservoir.render_master(headers, points)
    assert rendered["experience"][0]["bullets"] == ["Ran the cost workstream"]
    assert rendered["experience"][1]["bullets"] == ["Owned the data migration"]


# ── Empty bullets are dropped (noise), ordering preserved ─────────────────────

def test_empty_bullets_dropped():
    cv = {"experience": [{"role": "X", "company": "Y", "dates": "",
                          "bullets": ["Real one", "  ", "", "Second real"]}]}
    headers, points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    assert len(points) == 2
    rendered = cv_reservoir.render_master(headers, points)
    assert rendered["experience"][0]["bullets"] == ["Real one", "Second real"]


def test_ordering_preserved_within_role():
    cv = {"experience": [{"role": "X", "company": "Y", "dates": "",
                          "bullets": ["first", "second", "third"]}]}
    headers, points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    assert [p["ordering"] for p in points] == [0.0, 1.0, 2.0]
    assert cv_reservoir.render_master(headers, points)["experience"][0]["bullets"] == ["first", "second", "third"]


# ── Canonical / archived filtering (Phase 2 shape: variants + curation) ────────

def test_render_uses_canonical_and_ignores_other_phrasings():
    # A point with two phrasings — only the canonical one renders.
    cv = {"experience": [{"role": "X", "company": "Y", "dates": "", "bullets": ["Original line"]}]}
    headers, points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    pk = points[0]["point_key"]
    role = points[0]["role_anchor"]
    # Append a second, non-canonical phrasing of the SAME point (Phase 2 producer).
    points.append({
        "point_key": pk, "role_anchor": role, "section": "exp_bullet",
        "text": "Impact-led phrasing", "audience_tags": ["consulting"],
        "source": "gap_session", "is_canonical": False, "ordering": 0.0, "status": "active",
    })
    assert cv_reservoir.render_master(headers, points)["experience"][0]["bullets"] == ["Original line"]
    # Flip canonical → the new phrasing renders instead, still one bullet.
    points[0]["is_canonical"] = False
    points[1]["is_canonical"] = True
    assert cv_reservoir.render_master(headers, points)["experience"][0]["bullets"] == ["Impact-led phrasing"]


def test_archived_point_does_not_render():
    cv = {"experience": [{"role": "X", "company": "Y", "dates": "",
                          "bullets": ["Keep me", "Archive me"]}]}
    headers, points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    points[1]["status"] = "archived"
    assert cv_reservoir.render_master(headers, points)["experience"][0]["bullets"] == ["Keep me"]


def test_duplicate_canonical_renders_one_bullet_per_point():
    # Defensive: two canonical rows for the same point_key must not double the bullet.
    cv = {"experience": [{"role": "X", "company": "Y", "dates": "", "bullets": ["Solo point"]}]}
    headers, points = cv_reservoir.explode_master(cv, new_id=_seq_ids())
    points.append({**points[0], "text": "Accidental dup canonical"})
    rendered = cv_reservoir.render_master(headers, points)
    assert len(rendered["experience"][0]["bullets"]) == 1
