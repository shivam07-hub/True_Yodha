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

def test_parse_judge_reads_answers_and_leaves_the_rest_unanswered():
    raw = '[{"index": 0, "verdict": "high"}, {"index": 1, "verdict": "maybe"}, {"index": 9, "verdict": "high"}]'
    # index 2 was never answered — None, not 'different'. A guess recorded as a
    # verdict bars the pair from ever being asked again.
    assert role_dedup.parse_judge(raw, 3) == ["high", "maybe", None]
    assert role_dedup.parse_judge("garbage", 2) == [None, None]
    assert role_dedup.parse_judge('[{"index": 0, "verdict": "nuke"}]', 1) == [None]


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
        self.budgets: list[int] = []

    async def complete(self, messages, max_tokens=None):
        self.budgets.append(max_tokens)
        if isinstance(self._raw, Exception):
            raise self._raw
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


def test_a_confident_judge_still_asks_the_user(monkeypatch):
    """A role fold moves every story under it and writes no receipt, so nothing
    but the user's own ruling may fold one. `high` and `maybe` both propose."""
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
    out = asyncio.run(role_dedup.run_role_dedup("u1", provider=provider))
    assert out == {"judged": 3, "proposed": 2, "kept": 1}
    # the budget scales with the batch — a fixed cap starves a reasoning judge
    assert provider.budgets == [3 * role_dedup._JUDGE_TOKENS_PER_PAIR]
    assert [u["verdict"] for u in db.upserts] == ["proposed", "proposed", "keep_separate"]
    assert db.updates == []  # no story moved, no role archived


def test_run_role_dedup_proposes_a_maybe_for_the_user(monkeypatch):
    db = _FakeDb(reads={
        "career_roles": [
            _role("a", "MIT Manipal", "B.Tech ECE", "2012 – 2016", kind="education", created="1"),
            _role("b", "Manipal Institute of Technology", "BE Electronics", "2012 – 2016",
                  kind="education", created="2"),
        ],
        "role_merge_verdicts": [],
        "career_stories": [],
    })
    monkeypatch.setattr("app.database.get_supabase_admin", lambda: db)
    provider = _FakeProvider('[{"index": 0, "verdict": "maybe"}]')
    out = asyncio.run(role_dedup.run_role_dedup("u1", provider=provider))
    assert out == {"judged": 1, "proposed": 1, "kept": 0}
    assert [u["verdict"] for u in db.upserts] == ["proposed"]
    assert db.updates == []  # a proposal touches nothing


def test_a_judge_that_does_not_answer_records_nothing(monkeypatch):
    """The 47-verdict bug: a starved or failing judge used to stamp every pair
    'different', and a decided pair is never re-judged. Silence must decide
    nothing so the next run asks again."""
    roles = [
        _role("a", "Capgemini", "I&D Sales Manager", "2025 – Present", created="1"),
        _role("b", "Capgemini GCC Growth", "GTM BD Manager", "2025 – Present", created="2"),
    ]
    reads = {"career_roles": roles, "role_merge_verdicts": [], "career_stories": []}
    monkeypatch.setattr("app.database.get_supabase_admin", lambda: _FakeDb(reads))

    for raw in ("I'll compare these two roles. Both are at Capgemini and", TypeError("provider blew up")):
        db = _FakeDb(reads)
        monkeypatch.setattr("app.database.get_supabase_admin", lambda db=db: db)
        out = asyncio.run(role_dedup.run_role_dedup("u1", provider=_FakeProvider(raw)))
        assert out == {"judged": 0, "proposed": 0, "kept": 0}
        assert db.upserts == [] and db.updates == []


def test_run_role_dedup_batches_so_no_call_is_starved(monkeypatch):
    roles = [_role(f"r{i}", "Capgemini", f"T{i}", "2024", created=str(i)) for i in range(8)]
    db = _FakeDb(reads={"career_roles": roles, "role_merge_verdicts": [], "career_stories": []})
    monkeypatch.setattr("app.database.get_supabase_admin", lambda: db)
    provider = _FakeProvider("no json here")
    asyncio.run(role_dedup.run_role_dedup("u1", provider=provider))
    # 28 family pairs, capped at 48, asked 12 at a time
    assert provider.budgets == [12000, 12000, 4000]


def test_run_role_dedup_no_candidates_is_free(monkeypatch):
    db = _FakeDb(reads={"career_roles": [], "role_merge_verdicts": [], "career_stories": []})
    monkeypatch.setattr("app.database.get_supabase_admin", lambda: db)
    out = asyncio.run(role_dedup.run_role_dedup("u1"))
    assert out == {"judged": 0, "proposed": 0, "kept": 0}
    assert db.upserts == []
