"""role_dedup — the role-merge judge (#38). Pure helpers + the batched run."""
import asyncio

from app.services import role_dedup


def _role(rid, company, title, dates="", kind="work", status="active", created=""):
    return {
        "id": rid, "company": company, "title": title,
        "date_label": dates, "kind": kind, "status": status, "created_at": created,
    }


# ── dates ─────────────────────────────────────────────────────────────────────

def test_parse_years_formats():
    assert role_dedup.parse_years("May 2025 – Present") == (2025, 9999)
    assert role_dedup.parse_years("2016 – 2020") == (2016, 2020)
    assert role_dedup.parse_years("Aug '20- June'22") == (2020, 2022)
    assert role_dedup.parse_years("Acads") is None
    assert role_dedup.parse_years("") is None


def test_ranges_overlap():
    assert role_dedup.ranges_overlap((2020, 2022), (2022, 2024))
    assert not role_dedup.ranges_overlap((2016, 2020), (2022, 2024))
    assert not role_dedup.ranges_overlap(None, (2020, 2022))


# ── company family ────────────────────────────────────────────────────────────

def test_same_company_family():
    assert role_dedup.same_company_family("Capgemini", "Capgemini GCC Growth")
    assert role_dedup.same_company_family(
        "IIM Lucknow", "Indian Institute of Management (IIM) Lucknow"
    )
    assert role_dedup.same_company_family("JLL Technologies", "JLL Technology")
    assert not role_dedup.same_company_family("Accenture Strategy", "Capgemini")
    assert not role_dedup.same_company_family("", "Capgemini")


# ── candidates ────────────────────────────────────────────────────────────────

def test_candidate_pairs_family_and_dated():
    roles = [
        _role("a", "Capgemini", "I&D India Sales Manager", "May 2025 – Present"),
        _role("b", "Capgemini GCC Growth", "GTM BD Manager", "May 2025 - Present"),
        # cross-name education twins — no family match, same kind + overlap
        _role("c", "MIT Manipal", "B.Tech in ECE", "2016 - 2020", kind="education"),
        _role("d", "Manipal Institute of Technology", "BTech", "2016 – 2020", kind="education"),
        # unrelated
        _role("e", "Accenture Strategy", "Consulting Intern", "April 2023 – June 2023"),
    ]
    pairs = role_dedup.candidate_pairs(roles, decided=set())
    keys = {role_dedup.pair_key(str(a["id"]), str(b["id"])) for a, b in pairs}
    assert ("a", "b") in keys
    assert ("c", "d") in keys
    assert ("a", "e") not in keys


def test_candidate_pairs_respects_decided_and_archived():
    roles = [
        _role("a", "Capgemini", "X", "2024"),
        _role("b", "Capgemini", "Y", "2024"),
        _role("z", "Capgemini", "Z", "2024", status="archived"),
    ]
    assert role_dedup.candidate_pairs(roles, decided={("a", "b")}) == []


def test_candidate_pairs_capped():
    roles = [_role(f"r{i}", "Capgemini", f"T{i}", "2024") for i in range(12)]
    pairs = role_dedup.candidate_pairs(roles, decided=set())
    assert len(pairs) == role_dedup.MAX_PAIRS_PER_RUN


# ── judge parse ───────────────────────────────────────────────────────────────

def test_parse_judge_verdicts_and_defaults():
    raw = '[{"index": 0, "verdict": "high"}, {"index": 1, "verdict": "maybe"}, {"index": 9, "verdict": "high"}]'
    assert role_dedup.parse_judge(raw, 3) == ["high", "maybe", "different"]
    assert role_dedup.parse_judge("garbage", 2) == ["different", "different"]
    assert role_dedup.parse_judge('[{"index": 0, "verdict": "nuke"}]', 1) == ["different"]


# ── keep pick + label widening ───────────────────────────────────────────────

def test_pick_keep_most_stories_then_oldest():
    a = _role("a", "X", "T", created="2026-01-01")
    b = _role("b", "X", "T", created="2026-02-01")
    keep, dup = role_dedup.pick_keep(a, b, {"a": 2, "b": 5})
    assert keep["id"] == "b"
    keep, dup = role_dedup.pick_keep(a, b, {"a": 3, "b": 3})
    assert keep["id"] == "a"


def test_widened_date_label():
    assert role_dedup.widened_date_label("May 2025 – Present", "Jul 2024 – May 2025") == "2024 – Present"
    # dup inside keep → no touch
    assert role_dedup.widened_date_label("2019 – 2024", "Feb '19-Aug '19") is None
    # unparseable → no touch
    assert role_dedup.widened_date_label("Acads", "2016 – 2020") is None


# ── batched run (stubbed provider + db) ──────────────────────────────────────

class _FakeProvider:
    def __init__(self, raw):
        self._raw = raw

    async def complete(self, messages, max_tokens=None):
        return self._raw


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """Minimal chainable stub for the four tables run_role_dedup touches."""

    def __init__(self, db, table):
        self._db, self._table = db, table
        self._update = None
        self._eqs = {}

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._eqs[col] = val
        return self

    def order(self, *_a, **_k):
        return self

    def update(self, payload):
        self._update = payload
        return self

    def upsert(self, payload, on_conflict=""):
        self._db.upserts.append(payload)
        return self

    def execute(self):
        if self._update is not None:
            self._db.updates.append((self._table, self._eqs, self._update))
            return _Result([])
        return _Result(self._db.reads.get(self._table, []))


class _FakeDb:
    def __init__(self, reads):
        self.reads = reads
        self.updates = []
        self.upserts = []

    def table(self, name):
        return _Query(self, name)


def test_run_role_dedup_folds_proposes_records(monkeypatch):
    roles = [
        _role("a", "Capgemini", "I&D Sales Manager", "May 2025 – Present", created="1"),
        _role("b", "Capgemini GCC Growth", "GTM BD Manager", "May 2025 - Present", created="2"),
        _role("c", "Capgemini", "E.L.I.T.E Manager", "Jul 2024 – May 2025", created="3"),
    ]
    db = _FakeDb(reads={
        "career_roles": roles,
        "role_merge_verdicts": [],
        "career_stories": [
            {"role_id": "a", "title": "S1"}, {"role_id": "b", "title": "S2"},
            {"role_id": "b", "title": "S3"},
        ],
    })
    monkeypatch.setattr("app.database.get_supabase_admin", lambda: db)
    # pairs order: (a,b) family, (a,c) family, (b,c) family
    provider = _FakeProvider(
        '[{"index": 0, "verdict": "high"}, {"index": 1, "verdict": "maybe"}, {"index": 2, "verdict": "different"}]'
    )
    out = asyncio.get_event_loop().run_until_complete(
        role_dedup.run_role_dedup("u1", provider=provider)
    )
    assert out == {"judged": 3, "folded": 1, "proposed": 1}
    # fold: b kept (2 stories) — a's stories repointed to b, a archived
    story_moves = [u for u in db.updates if u[0] == "career_stories"]
    assert story_moves and story_moves[0][2] == {"role_id": "b"} and story_moves[0][1]["role_id"] == "a"
    role_archives = [u for u in db.updates if u[0] == "career_roles" and u[2].get("status") == "archived"]
    assert role_archives and role_archives[0][1]["id"] == "a"
    # all three pairs recorded
    assert {u["verdict"] for u in db.upserts} == {"auto_folded", "proposed", "keep_separate"}


def test_run_role_dedup_no_candidates_is_free(monkeypatch):
    db = _FakeDb(reads={"career_roles": [], "role_merge_verdicts": [], "career_stories": []})
    monkeypatch.setattr("app.database.get_supabase_admin", lambda: db)
    out = asyncio.get_event_loop().run_until_complete(role_dedup.run_role_dedup("u1"))
    assert out == {"judged": 0, "folded": 0, "proposed": 0}
    assert db.upserts == []
