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


# ── retry_stale_ingests ──────────────────────────────────────────────────────

class _PendingRepo:
    def __init__(self, entries):
        self._entries = entries

    def pending_entries(self, user_id, limit=20):
        return self._entries


def test_retry_stale_ingests_requeues_old_and_debounces(monkeypatch):
    from datetime import datetime, timedelta, timezone

    calls: list[str] = []
    monkeypatch.setattr(cr, "enqueue_ingest", lambda uid, eid: calls.append(eid))
    cr._last_requeue.clear()

    old = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    fresh = datetime.now(timezone.utc).isoformat()
    repo = _PendingRepo([
        {"id": "stale-1", "created_at": old},
        {"id": "fresh-1", "created_at": fresh},   # too young → left alone
        {"id": "junk-ts", "created_at": "not-a-date"},  # unparseable → eligible
    ])

    assert cr.retry_stale_ingests(repo, "u1") == 2
    assert calls == ["stale-1", "junk-ts"]
    # second poll inside the debounce window is a no-op
    assert cr.retry_stale_ingests(repo, "u1") == 0
    assert calls == ["stale-1", "junk-ts"]
    cr._last_requeue.clear()


# ── dedup ────────────────────────────────────────────────────────────────────

def test_cosine():
    a = [1.0, 0.0, 0.0]
    b = [1.0, 0.0, 0.0]
    c = [0.0, 1.0, 0.0]
    assert cr.cosine(a, b) == 1.0
    assert cr.cosine(a, c) == 0.0


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
        {"id": "p1", "story_id": "s1", "text": "Canonical pointer.", "is_canonical": True},
        {"id": "p2", "story_id": "s1", "text": "Variant pointer.", "is_canonical": False},
        {"id": "p3", "story_id": "s3", "text": "Scored 99.65 percentile.", "is_canonical": True},
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
    # The drawer needs every phrasing, canonical first (ADR-0023).
    phrasings = r1["stories"][0]["phrasings"]
    assert len(phrasings) == 2 and phrasings[0]["is_canonical"] is True
    assert phrasings[0]["text"] == "Canonical pointer."
    # the id is what promote/drop act on — it must survive the projection
    assert [ph["id"] for ph in phrasings] == ["p1", "p2"]
    assert all(set(ph) == {"id", "text", "is_canonical"} for ph in phrasings)
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


# ── story_pointers: two silent ceilings ──────────────────────────────────────

class _PointerQuery:
    """Records the id list and serves fixed-size pages, like PostgREST."""

    def __init__(self, db: "_PointerDb"):
        self._db = db
        self._ids: list[str] = []

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def in_(self, _col, values):
        self._ids = list(values)
        self._db.chunks.append(list(values))
        return self

    def range(self, start, end):
        self._start, self._end = start, end
        return self

    def execute(self):
        rows = [r for r in self._db.rows if r["story_id"] in self._ids]
        page = rows[self._start:self._end + 1]
        self._db.pages.append(len(page))

        class _R:
            data = page
        return _R()


class _PointerDb:
    def __init__(self, rows):
        self.rows = rows
        self.chunks: list[list[str]] = []
        self.pages: list[int] = []

    def table(self, _name):
        return _PointerQuery(self)


def test_story_pointers_chunks_the_id_list_so_the_url_cannot_grow_unbounded():
    from app.repositories import career_reservoir as repo_mod

    ids = [f"s{i:04d}" for i in range(150)]
    db = _PointerDb([{"id": f"p{i}", "story_id": sid} for i, sid in enumerate(ids)])
    rows = repo_mod.CareerReservoirRepository(db).story_pointers("u1", ids)

    assert len(rows) == 150, "every pointer comes back"
    assert all(len(c) <= repo_mod._ID_CHUNK for c in db.chunks)
    assert sum(len(c) for c in db.chunks) == 150, "each id asked for exactly once"


def test_story_pointers_pages_past_the_1000_row_ceiling():
    """PostgREST truncates at 1000 in silence. A dropped pointer is a CV bullet
    that vanishes, so the read pages instead of trusting one response."""
    from app.repositories import career_reservoir as repo_mod

    ids = ["s1"]
    db = _PointerDb([{"id": f"p{i}", "story_id": "s1"} for i in range(2500)])
    rows = repo_mod.CareerReservoirRepository(db).story_pointers("u1", ids)

    assert len(rows) == 2500
    assert db.pages[:2] == [repo_mod._PAGE, repo_mod._PAGE], "full pages keep going"
    assert db.pages[-1] < repo_mod._PAGE, "a short page ends the read"


def test_story_pointers_of_nothing_asks_nothing():
    from app.repositories import career_reservoir as repo_mod

    db = _PointerDb([])
    assert repo_mod.CareerReservoirRepository(db).story_pointers("u1", []) == []
    assert db.chunks == []
