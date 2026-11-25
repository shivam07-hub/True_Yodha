"""`public_job_query` — the landing search and the MCP's `myro_search_jobs`.

The place, the work mode and liveness are filtered in SQL BEFORE the newest-N
window. They used to be filtered in Python after it: "data analyst" + Mumbai
took the 400 newest national matches of "data" OR "analyst" (four days of
rows, 8 data analyst titles), found no Mumbai row among them, and answered
with Noida while Mumbai had five live data analyst jobs.

The fake below models `search_live_jobs`
(database/migrations/20261124090000_search_live_jobs_on_titles.sql): role
words in the TITLE, the place in the blob, liveness, all ahead of the window,
newest first. Role words used to match the whole blob, so a bank job filed
under "Marketing" was a "marketing manager": Delhi's window held 1 of its 14
Marketing Manager titles.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.repositories import jobs as jobs_module
from app.repositories.jobs import JobsRepository

_BLOB_FIELDS = ("job_title", "company_name", "location_city", "location_country", "role_domain")


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _Rpc:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def execute(self) -> _Result:
        return _Result(self._rows)


class _LiveSearchDB:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.calls: list[dict[str, Any]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _Rpc:
        assert name == "search_live_jobs", name
        self.calls.append(params)
        terms = [t.casefold() for t in params["p_terms"]]
        cities = [c.casefold() for c in params.get("p_cities") or []]
        countries = [c.casefold() for c in params.get("p_countries") or []]
        mode = (params.get("p_mode") or "").casefold()
        match = all if params.get("p_match_all", True) else any

        def blob(row: dict[str, Any]) -> str:
            return " | ".join(str(row.get(f) or "") for f in _BLOB_FIELDS).casefold()

        def title(row: dict[str, Any]) -> str:
            return str(row.get("job_title") or "").casefold()

        hits = [
            row for row in self.rows
            if match(t in title(row) for t in terms)
            and (not cities or any(c in blob(row) for c in cities))
            and (not countries or any(c in blob(row) for c in countries))
            and row.get("is_active") is True
            and row.get("listing_confidence") == "active"
            and (not mode or str(row.get("location_mode") or "").casefold() == mode)
        ]
        hits.sort(key=lambda r: r.get("first_seen") or 0, reverse=True)
        return _Rpc(hits[: int(params["p_limit"])])


def _job(job_id: str, title: str, city: str, *, first_seen: int = 20261122, **extra: Any) -> dict[str, Any]:
    return {
        "job_id": job_id,
        "job_title": title,
        "company_name": "Acme",
        "location_city": city,
        "location_country": "India",
        "location_mode": "onsite",
        "role_domain": "Data",
        "first_seen": first_seen,
        "locations": [city],
        "is_active": True,
        "listing_confidence": "active",
        **extra,
    }


@pytest.fixture(autouse=True)
def _fresh_cache():
    jobs_module._search_cache.clear()
    yield
    jobs_module._search_cache.clear()


def test_a_citys_jobs_are_found_when_every_newer_match_is_elsewhere():
    newer_elsewhere = [_job(f"noida-{i}", "Lead Data Analyst", "Noida") for i in range(500)]
    older_in_mumbai = [_job(f"mumbai-{i}", "Data Analyst", "Mumbai", first_seen=20260909) for i in range(3)]
    db = _LiveSearchDB(newer_elsewhere + older_in_mumbai)

    result = JobsRepository(db).public_job_query(role="data analyst", location_city="Mumbai")

    assert result["relaxed"] == []
    assert {row["job_id"] for row in result["rows"]} == {"mumbai-0", "mumbai-1", "mumbai-2"}
    assert "mumbai" in db.calls[0]["p_cities"]


def test_a_closed_job_never_comes_back():
    db = _LiveSearchDB([
        _job("closed", "Data Analyst", "Mumbai", first_seen=20261123, is_active=False),
        _job("unsure", "Data Analyst", "Mumbai", first_seen=20261123, listing_confidence="stale"),
        *[_job(f"open-{i}", "Data Analyst", "Mumbai") for i in range(3)],
    ])

    ids = {row["job_id"] for row in JobsRepository(db).public_job_query(role="data analyst")["rows"]}

    assert ids == {"open-0", "open-1", "open-2"}


def test_every_word_of_the_role_must_match_before_any_one_word_does():
    db = _LiveSearchDB([
        *[_job(f"engineer-{i}", "Data Engineer", "Mumbai", first_seen=20261123) for i in range(5)],
        *[_job(f"analyst-{i}", "Data Analyst", "Mumbai") for i in range(3)],
    ])

    rows = JobsRepository(db).public_job_query(role="data analyst", location_city="Mumbai")["rows"]

    assert [row["job_title"] for row in rows] == ["Data Analyst"] * 3


def test_a_role_no_title_spells_out_whole_falls_back_to_any_of_its_words():
    db = _LiveSearchDB([_job(f"analyst-{i}", "Data Analyst", "Mumbai") for i in range(3)])

    result = JobsRepository(db).public_job_query(role="growth data analyst", location_city="Mumbai")

    assert len(result["rows"]) == 3 and result["relaxed"] == []
    # Whole role in Mumbai, whole role anywhere, then any word in Mumbai.
    assert [(call["p_match_all"], call["p_cities"]) for call in db.calls] == [
        (True, ["mumbai"]), (True, None), (False, ["mumbai"]),
    ]


def test_the_role_is_kept_before_the_place_and_the_place_before_a_loose_role():
    db = _LiveSearchDB([
        *[_job(f"remote-{i}", "Data Platform Engineer", "Pune", location_mode="remote") for i in range(5)],
        *[_job(f"analyst-{i}", "Data Analyst", "Mumbai") for i in range(3)],
    ])

    result = JobsRepository(db).public_job_query(role="data analyst", location_mode="remote")

    assert result["relaxed"] == ["location"]
    assert {row["job_title"] for row in result["rows"]} == {"Data Analyst"}


def test_a_title_holding_the_whole_role_ranks_above_one_that_scatters_it():
    db = _LiveSearchDB([
        _job("scattered", "Reference Data & Security Master Analyst", "Mumbai", first_seen=20261123),
        _job("whole", "Data Analyst - Cross Sell", "Mumbai", first_seen=20260909),
        _job("other", "Senior Data Analyst", "Mumbai", first_seen=20260909),
    ])

    rows = JobsRepository(db).public_job_query(role="data analyst", location_city="Mumbai")["rows"]

    assert rows[-1]["job_id"] == "scattered"


def test_a_city_and_a_country_must_both_hold():
    db = _LiveSearchDB([
        *[_job(f"pune-{i}", "Data Analyst", "Pune", first_seen=20261123) for i in range(5)],
        *[_job(f"mumbai-{i}", "Data Analyst", "Mumbai") for i in range(3)],
    ])

    result = JobsRepository(db).public_job_query(
        role="data analyst", location_city="Mumbai", location_country="India"
    )

    assert {row["location_city"] for row in result["rows"]} == {"Mumbai"}
    assert result["relaxed"] == []


def test_a_city_spelled_the_old_way_finds_jobs_filed_under_the_new_name():
    db = _LiveSearchDB([_job(f"blr-{i}", "Software Engineer", "Bengaluru") for i in range(3)])

    result = JobsRepository(db).public_job_query(role="software engineer", location_city="Bangalore")

    assert len(result["rows"]) == 3 and result["relaxed"] == []


def test_the_work_mode_is_filtered_before_the_window():
    db = _LiveSearchDB([
        *[_job(f"onsite-{i}", "Data Analyst", "Mumbai", first_seen=20261123) for i in range(500)],
        *[_job(f"remote-{i}", "Data Analyst", "Mumbai", location_mode="remote") for i in range(3)],
    ])

    result = JobsRepository(db).public_job_query(role="data analyst", location_mode="remote")

    assert {row["job_id"] for row in result["rows"]} == {"remote-0", "remote-1", "remote-2"}
    assert result["relaxed"] == []


def test_a_thin_city_relaxes_the_place_but_shows_its_own_jobs_first():
    db = _LiveSearchDB([
        *[_job(f"noida-{i}", "Data Analyst", "Noida", first_seen=20261123) for i in range(5)],
        _job("mumbai-0", "Data Analyst", "Mumbai"),
    ])

    result = JobsRepository(db).public_job_query(role="data analyst", location_city="Mumbai")

    assert result["relaxed"] == ["location"]
    assert result["rows"][0]["job_id"] == "mumbai-0"
    assert len(result["rows"]) == 6


def test_a_stronger_rungs_rows_stay_above_a_weaker_rungs():
    db = _LiveSearchDB([
        _job("ib-mumbai", "Investment Banking Analyst", "Mumbai", first_seen=20260909),
        *[_job(f"bank-{i}", "Relationship Manager, Retail Banking", "Mumbai", first_seen=20261123) for i in range(60)],
    ])

    result = JobsRepository(db).public_job_query(role="investment banking analyst", location_city="Mumbai")

    assert result["rows"][0]["job_id"] == "ib-mumbai"
    assert result["relaxed"] == []


def test_a_role_word_in_the_jobs_category_alone_is_not_a_match():
    filed_under_marketing = [
        _job(f"rm-{i}", "Relationship Manager", "Delhi", first_seen=20261123, role_domain="Marketing")
        for i in range(200)
    ]
    titled = [_job(f"mm-{i}", "Marketing Manager", "Delhi", first_seen=20260909) for i in range(3)]
    db = _LiveSearchDB(filed_under_marketing + titled)

    result = JobsRepository(db).public_job_query(role="marketing manager", location_city="Delhi")

    assert {row["job_id"] for row in result["rows"]} == {"mm-0", "mm-1", "mm-2"}
    assert result["relaxed"] == []
