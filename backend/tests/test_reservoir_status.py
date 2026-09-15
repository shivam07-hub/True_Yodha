"""GET /cv/reservoir/status — the cheap read behind "Myro is updating your CV".

The panel it feeds lives on the DEFAULT `/cv` view, so the contract under test is
as much about what this read does NOT do as what it returns.
"""
from datetime import datetime, timedelta, timezone

from app.repositories import career_reservoir as repo_mod


class _Query:
    def __init__(self, db):
        self._db = db
        self._start, self._end = 0, repo_mod._PAGE - 1

    def select(self, cols):
        self._db.selected = cols
        return self

    def eq(self, *_a):
        return self

    def in_(self, col, values):
        self._db.filters.append((col, list(values)))
        return self

    def order(self, *_a, **_k):
        self._db.ordered = True
        return self

    def range(self, start, end):
        self._start, self._end = start, end
        return self

    def execute(self):
        page = self._db.rows[self._start:self._end + 1]
        self._db.pages.append(len(page))

        class _R:
            data = page
        return _R()


class _Db:
    def __init__(self, rows):
        self.rows = rows
        self.filters: list[tuple[str, list]] = []
        self.pages: list[int] = []
        self.selected = ""
        self.ordered = False
        self.tables: list[str] = []

    def table(self, name):
        self.tables.append(name)
        return _Query(self)


def _status(rows, *, hours=24):
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    db = _Db(rows)
    return repo_mod.CareerReservoirRepository(db).forward_pass_status("u1", since=since), db


def _stamp(hours_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()


# ── pending ──────────────────────────────────────────────────────────────────

def test_an_inflow_still_being_read_is_pending():
    out, _ = _status([
        {"id": "1", "kind": "file", "processed_at": None},
        {"id": "2", "kind": "answer", "processed_at": _stamp(0.1)},
    ])
    assert out["pending"] == 1


def test_nothing_in_flight_and_nothing_recent_says_nothing():
    out, _ = _status([{"id": "1", "kind": "file", "processed_at": _stamp(100)}])
    assert out == {"pending": 0, "banked_recently": False}


# ── banked_recently: why a reload does not lose the moment ───────────────────

def test_a_cv_that_landed_inside_the_window_still_has_something_to_say():
    """The panel must survive a refresh thirty seconds after the ingest finished
    — otherwise the user sees their CV and no sign anything happened."""
    out, _ = _status([{"id": "1", "kind": "file", "processed_at": _stamp(0.01)}])
    assert out["pending"] == 0
    assert out["banked_recently"] is True


def test_the_window_closes_on_its_own():
    """No flag and no column: the panel expires because the timestamp does."""
    out, _ = _status([{"id": "1", "kind": "file", "processed_at": _stamp(25)}])
    assert out["banked_recently"] is False


def test_an_answer_is_not_a_cv_landing():
    """A banked gap answer is an inflow too. It improves one story — it is not
    the arrival of a whole CV, and it must not re-open the panel."""
    out, _ = _status([{"id": "1", "kind": "answer", "processed_at": _stamp(0.1)}])
    assert out["banked_recently"] is False


def test_a_hand_dumped_cv_counts_the_same_as_the_forward_pass():
    """Same document, different door — and the same questions waiting. Nothing
    here reads `source`, so the two cannot drift apart."""
    out, _ = _status([{"id": "1", "kind": "file", "processed_at": _stamp(1)}])
    assert out["banked_recently"] is True


def test_an_unparseable_timestamp_is_not_recent_rather_than_a_crash():
    out, _ = _status([{"id": "1", "kind": "file", "processed_at": "not-a-date"}])
    assert out == {"pending": 0, "banked_recently": False}


def test_a_naive_timestamp_is_read_as_utc_not_dropped():
    naive = (datetime.now(timezone.utc) - timedelta(hours=1)).replace(tzinfo=None).isoformat()
    out, _ = _status([{"id": "1", "kind": "file", "processed_at": naive}])
    assert out["banked_recently"] is True


def test_a_zulu_offset_is_read_the_same_as_plus_zero():
    """PostgREST has returned both spellings for one column. A lexicographic
    comparison answers False for the whole window when they disagree."""
    zulu = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
    out, _ = _status([{"id": "1", "kind": "file", "processed_at": zulu}])
    assert out["banked_recently"] is True


# ── the read-path contract ───────────────────────────────────────────────────

def test_it_reads_three_columns_and_one_table():
    """This rides the busiest authed page. Widening it is how a poll becomes a
    page-load cost — `/cv/reservoir/profile` is where the expensive read lives."""
    _, db = _status([{"id": "1", "kind": "file", "processed_at": None}])
    assert db.tables == ["cv_dump_entries"]
    assert db.selected == "id, kind, processed_at"


def test_it_pages_past_the_1000_row_ceiling():
    """PostgREST truncates at 1000 in silence. A truncated read would report
    zero pending while an ingest is still running."""
    rows = [{"id": f"e{i}", "kind": "answer", "processed_at": _stamp(1)} for i in range(2400)]
    rows.append({"id": "last", "kind": "file", "processed_at": None})
    out, db = _status(rows)
    assert out["pending"] == 1, "the tail is read, not dropped"
    assert db.pages[0] == repo_mod._PAGE
    assert db.ordered is True, "paging without an order is not stable"


# ── the 1000-row ceiling, on every per-user read that can outgrow it ──────────

class _CeilQuery:
    def __init__(self, db):
        self._db = db
        self._start, self._end = 0, repo_mod._PAGE - 1

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a):
        return self

    def in_(self, *_a):
        return self

    @property
    def not_(self):
        """`.not_.is_(...)` reads the attribute first, then calls `is_` on it."""
        return self

    def is_(self, *_a):
        return self

    def order(self, col, **_k):
        self._db.order_cols.append(col)
        return self

    def range(self, start, end):
        self._start, self._end = start, end
        return self

    def execute(self):
        page = self._db.rows[self._start:self._end + 1]
        self._db.pages.append(len(page))

        class _R:
            data = page
        return _R()


class _CeilDb:
    def __init__(self, n):
        self.rows = [{"id": f"r{i}", "processed_at": None, "payload": {}} for i in range(n)]
        self.pages: list[int] = []
        self.order_cols: list[str] = []

    def table(self, _name):
        return _CeilQuery(self)


def _repo(n):
    db = _CeilDb(n)
    return repo_mod.CareerReservoirRepository(db), db


def test_list_stories_pages_because_a_lost_story_takes_its_pointers_with_it():
    repo, db = _repo(2300)
    assert len(repo.list_stories("u1")) == 2300
    assert db.pages[0] == repo_mod._PAGE


def test_list_roles_pages():
    repo, db = _repo(1400)
    assert len(repo.list_roles("u1")) == 1400


def test_story_embeddings_pages_so_a_duplicate_is_still_proposable():
    repo, db = _repo(1200)
    assert len(repo.story_embeddings("u1")) == 1200


def test_ingest_status_pages_so_pending_cannot_read_zero_mid_ingest():
    repo, db = _repo(1500)
    assert repo.ingest_status("u1")["pending"] == 1500


def test_every_paged_read_carries_a_unique_tiebreak():
    """`created_at` is not unique. Paging on it alone lets PostgREST return one
    row twice across a page boundary and skip another — so `id` comes last."""
    repo, db = _repo(10)
    repo.list_stories("u1")
    assert db.order_cols[-1] == "id"

    repo2, db2 = _repo(10)
    repo2.list_roles("u1")
    assert db2.order_cols[-1] == "id"


# ── the heal, and when it is paid for ────────────────────────────────────────

class _StubRepo:
    def __init__(self, pending):
        self._pending = pending
        self.healed = 0

    def forward_pass_status(self, _user_id, *, since):
        return {"pending": self._pending, "banked_recently": False}


def _route(pending, monkeypatch):
    from app.routers.cv import reservoir_status as mod

    repo = _StubRepo(pending)
    monkeypatch.setattr(
        mod.career_reservoir, "retry_stale_ingests",
        lambda r, _u: setattr(r, "healed", r.healed + 1),
    )

    class _User:
        id = "u1"
    return mod.reservoir_status(user=_User(), repo=repo), repo


def test_a_pending_ingest_is_healed_while_the_panel_watches_it(monkeypatch):
    """The panel polls every 4s; a job lost to a worker redeploy is otherwise
    only re-enqueued by the hourly sweep, so the pulse runs for an hour."""
    out, repo = _route(1, monkeypatch)
    assert out.pending == 1
    assert repo.healed == 1


def test_nothing_pending_pays_nothing(monkeypatch):
    """The heal reads `pending_entries`. This route exists to be cheap, so it is
    paid only in the rare, short state where it can do anything."""
    out, repo = _route(0, monkeypatch)
    assert repo.healed == 0
