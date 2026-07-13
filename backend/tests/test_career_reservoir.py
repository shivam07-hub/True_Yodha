"""career_reservoir — pure helpers: role reconciliation, dedup, profile view."""
from app.services import career_reservoir as cr


# ── reconcile_role ───────────────────────────────────────────────────────────

_EXISTING = [
    {"id": "r1", "company": "Capgemini", "title": "Insights & Data India Sales Manager", "kind": "work"},
    {"id": "r2", "company": "JLL Technologies", "title": "Data Engineer", "kind": "work"},
    {"id": "r3", "company": "", "title": "CAT 2021", "kind": "other"},
]


def test_reconcile_matches_same_company_similar_title():
    assert cr.reconcile_role(
        {"company": "Capgemini", "title": "India Sales Manager"}, _EXISTING
    ) == "r1"


def test_reconcile_matches_company_substring():
    assert cr.reconcile_role(
        {"company": "JLL", "title": "Data Engineer"}, _EXISTING
    ) == "r2"


def test_reconcile_no_match_mints_new():
    assert cr.reconcile_role(
        {"company": "Accenture", "title": "Strategy Consultant"}, _EXISTING
    ) is None
    # same company, unrelated title → new role, not a wrong merge
    assert cr.reconcile_role(
        {"company": "Capgemini", "title": "Barista"}, _EXISTING
    ) is None


def test_reconcile_companyless_exact_title():
    assert cr.reconcile_role({"company": "", "title": "CAT 2021"}, _EXISTING) == "r3"


def test_reconcile_cross_slot_same_dates():
    """One CV lists the team as company, another as title (same period) → same role.
    The live repro: 'Capgemini GCC Growth · Sales Enablement Team' vs
    'Sales Enablement Team · Agentic Sales Enablement' (July 2024 – April 2025)."""
    existing = [{
        "id": "r9", "company": "Capgemini GCC Growth", "title": "Sales Enablement Team",
        "kind": "work", "date_label": "July 2024 - April 2025",
    }]
    assert cr.reconcile_role(
        {"company": "Sales Enablement Team", "title": "Agentic Sales Enablement",
         "date_label": "July 2024 – April 2025"},
        existing,
    ) == "r9"
    # different period → NOT merged (cross-slot is date-gated)
    assert cr.reconcile_role(
        {"company": "Sales Enablement Team", "title": "Agentic Sales Enablement",
         "date_label": "Jan 2020 - June 2022"},
        existing,
    ) is None
    # no dates on either side → never cross-slot merged
    assert cr.reconcile_role(
        {"company": "Sales Enablement Team", "title": "Agentic Sales Enablement", "date_label": ""},
        existing,
    ) is None


def test_dates_match_normalizes_dashes_and_case():
    assert cr._dates_match("July 2024 - April 2025", "july 2024 – april 2025")
    assert not cr._dates_match("July 2024 - April 2025", "May 2025 - Present")
    assert not cr._dates_match("", "")


# ── dedup ────────────────────────────────────────────────────────────────────

def test_cosine_and_is_duplicate():
    a = [1.0, 0.0, 0.0]
    b = [1.0, 0.0, 0.0]
    c = [0.0, 1.0, 0.0]
    assert cr.cosine(a, b) == 1.0
    assert cr.cosine(a, c) == 0.0
    assert cr.is_duplicate(a, [c, b])
    assert not cr.is_duplicate(a, [c])
    assert not cr.is_duplicate([], [b])


def test_parse_vector_shapes():
    assert cr._parse_vector([0.1, 0.2]) == [0.1, 0.2]
    assert cr._parse_vector("[0.1,0.2]") == [0.1, 0.2]
    assert cr._parse_vector("junk") is None
    assert cr._parse_vector(None) is None


def test_story_embed_text_identity_fields():
    text = cr.story_embed_text({
        "title": "T&M expansion",
        "pointer": "Generated 50+ requirements.",
        "narrative": {"result": "₹18 Cr pipeline.", "action": "ignored"},
    })
    assert "T&M expansion" in text and "50+" in text and "₹18 Cr" in text
    assert "ignored" not in text


def test_pointer_section_mapping():
    assert cr.pointer_section({"kind": "project"}, "work") == "exp_bullet"
    assert cr.pointer_section({"kind": "achievement"}, "volunteer") == "exp_bullet"
    assert cr.pointer_section({"kind": "accolade"}, "work") == "proj_bullet"
    assert cr.pointer_section({"kind": "project"}, None) == "proj_bullet"
    assert cr.pointer_section({"kind": "project"}, "education") == "proj_bullet"


# ── build_profile_view ───────────────────────────────────────────────────────

def _profile_fixture():
    roles = [
        {"id": "r1", "company": "Capgemini", "title": "Sales Manager", "kind": "work",
         "date_label": "2025–", "created_at": "2026-01-02", "status": "active"},
        {"id": "r2", "company": "IIM Lucknow", "title": "MBA", "kind": "education",
         "created_at": "2026-01-01", "status": "active"},
        {"id": "r3", "company": "Ghost Co", "title": "Empty", "kind": "work",
         "created_at": "2026-01-03", "status": "active"},  # no stories → omitted
    ]
    stories = [
        {"id": "s1", "role_id": "r1", "kind": "project", "title": "Pipeline",
         "narrative": {"result": "50+ reqs"}, "metrics": [{"value": "50+", "what": "reqs"}],
         "skills": ["GTM", "Sales"], "status": "active"},
        {"id": "s2", "role_id": "r2", "kind": "education", "title": "Top 10%",
         "narrative": {}, "metrics": [], "skills": ["GTM"], "status": "active"},
        {"id": "s3", "role_id": None, "kind": "accolade", "title": "CAT 99.65",
         "narrative": {}, "metrics": [], "skills": [], "status": "active"},
        {"id": "s4", "role_id": "r1", "kind": "project", "title": "Archived thing",
         "narrative": {}, "metrics": [], "skills": [], "status": "archived"},
    ]
    pointers = [
        {"story_id": "s1", "text": "Canonical pointer.", "is_canonical": True},
        {"story_id": "s1", "text": "Variant pointer.", "is_canonical": False},
        {"story_id": "s3", "text": "Scored 99.65 percentile.", "is_canonical": True},
    ]
    return roles, stories, pointers


def test_build_profile_view_grouping_and_order():
    roles, stories, pointers = _profile_fixture()
    view = cr.build_profile_view(roles, stories, pointers, pending_inflows=2)

    # work before education; empty role omitted
    assert [r["id"] for r in view["roles"]] == ["r1", "r2"]
    r1 = view["roles"][0]
    assert r1["stories"][0]["pointer"] == "Canonical pointer."
    assert r1["stories"][0]["variant_count"] == 2
    # archived story excluded
    assert all(s["id"] != "s4" for s in r1["stories"])
    # role-less story → highlights
    assert view["highlights"][0]["id"] == "s3"
    # competencies frequency-ranked
    assert view["competencies"][0] == "GTM"
    assert view["story_count"] == 3
    assert view["pending_inflows"] == 2


def test_build_profile_view_empty():
    view = cr.build_profile_view([], [], [])
    assert view == {
        "roles": [], "highlights": [], "competencies": [],
        "story_count": 0, "pending_inflows": 0,
    }
