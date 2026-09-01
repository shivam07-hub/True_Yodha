"""Read-shape guard for /career-skill-path (ARCHITECTURE_READ_PATH.md §2).

The existing contract guard (test_read_contract.py) watches `run_concurrently`,
so it only sees fan-out WIDTH. /career-skill-path went to production doing
nineteen SEQUENTIAL reads and no guard in this suite could see it: a route that
never calls the fan-out helper is invisible to the seam the contract is
enforced at.

That is the failure this file closes. It counts every round trip the assemble
path makes, sequential ones included, and pins the shape:

  * a band count that grows must not multiply the reads — the whole point of
    collapsing the three band maps onto one shared skill lookup; and
  * the same table must not be read once per band.

When it fails: do not raise the number. Fold the new read into an existing
wave, or precompute it.
"""
from __future__ import annotations

from typing import Any

import app.services.career_skill_path_read as read_module
from app.services.career_skill_path_read import assemble

SNAPSHOT = {
    "id": "11111111-1111-1111-1111-111111111111",
    "user_id": "u1",
    "role_title": "Data Analyst",
    "l1_career_area": "Data",
    "l2_role_family": "data_analysis",
    "seniority": "mid",
    "locations": ["Bengaluru"],
    "cv_baseline_id": None,
    "created_at": "2026-08-27T00:00:00Z",
}

MARKET_ROWS = [
    {
        "taxonomy_key": "sql",
        "skill_job_count": 90,
        "band_job_count": 100,
        "primary_job_count": 80,
        "has_side_skill": False,
    },
    {
        "taxonomy_key": "python",
        "skill_job_count": 60,
        "band_job_count": 100,
        "primary_job_count": 40,
        "has_side_skill": True,
    },
]

TABLE_ROWS: dict[str, list[dict[str, Any]]] = {
    "career_target_snapshots": [SNAPSHOT],
    "learning_path_requests": [],
    "skill_certificates": [],
    "role_family_labels": [{"label": "Data Analysis"}],
    "skills": [
        {"id": 1, "taxonomy_key": "sql", "display_name": "SQL"},
        {"id": 2, "taxonomy_key": "python", "display_name": "Python"},
    ],
    "user_skills": [{"skill_id": 1, "matched_level": 3, "evidence_text": "Wrote reports"}],
    "skill_assessed_level": [{"skill_id": 2, "assessed_level": 2}],
    "skill_questions": [],
}


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _Query:
    """Chainable PostgREST stand-in. Records one read per execute()."""

    def __init__(self, reads: list[str], name: str) -> None:
        self._reads = reads
        self._name = name

    def __getattr__(self, _attr: str):  # select/eq/in_/is_/order/limit/neq/...
        return lambda *_a, **_k: self

    def execute(self) -> _Result:
        self._reads.append(self._name)
        return _Result(list(TABLE_ROWS.get(self._name, [])))


class _RecordingClient:
    """Counts every round trip, concurrent or sequential."""

    def __init__(self) -> None:
        self.reads: list[str] = []

    def table(self, name: str) -> _Query:
        return _Query(self.reads, name)

    def rpc(self, name: str, _params: dict[str, Any] | None = None) -> _Query:
        query = _Query(self.reads, f"rpc:{name}")
        query.execute = lambda: (  # type: ignore[method-assign]
            self.reads.append(f"rpc:{name}") or _Result(list(MARKET_ROWS))
        )
        return query


def _assemble(monkeypatch=None) -> tuple[dict[str, Any], list[str]]:
    db = _RecordingClient()
    return assemble(db, "u1"), db.reads


def _assemble_with_waves(monkeypatch) -> tuple[list[str], list[int]]:
    """Assemble while recording the width of every concurrent read wave."""
    widths: list[int] = []
    real = read_module.run_concurrently

    def _spy(sections, *, label=""):
        widths.append(len(sections))
        return real(sections, label=label)

    monkeypatch.setattr(read_module, "run_concurrently", _spy)
    db = _RecordingClient()
    assemble(db, "u1")
    return db.reads, widths


def test_assemble_answers_every_band_within_the_read_contract() -> None:
    payload, reads = _assemble()

    # "mid" has both neighbours, so this is the three-band worst case.
    assert payload["anchor"]["seniority"] == "mid"
    assert payload["lower"]["seniority"] == "entry"
    assert payload["higher"]["seniority"] == "senior"

    # The shape, spelled out so a future reader can see what the number is made of:
    #   1  career_target_snapshots        (must resolve family + band first)
    #   3  requests / certificates / label            — one wave
    #   3  market RPC, one per band                   — one wave
    #   1  skills, over the UNION of every band's demand
    #   3  user_skills / assessed / ladders           — one wave
    # Eleven reads, five round trips. It shipped at nineteen, all sequential.
    assert len(reads) <= 11, (
        f"/career-skill-path now issues {len(reads)} reads: {reads}. Do not raise this "
        "number — fold the new read into one of the three existing waves, or precompute "
        "it as Tier 0. It alerted at 5,882ms p50 the day after it shipped at nineteen."
    )


def test_no_read_wave_exceeds_the_concurrency_contract(monkeypatch) -> None:
    """§2: at most 3 concurrent DB reads per user-facing request.

    Width and depth are different failures. test_read_contract.py already guards
    width for routes that call the fan-out helper; this asserts BOTH here, for a
    route that previously called it not at all.
    """
    reads, widths = _assemble_with_waves(monkeypatch)

    assert widths, "assemble no longer batches its reads into waves"
    assert max(widths) <= 3, (
        f"a read wave fans out to {max(widths)} against the contract's 3."
    )
    round_trips = len(reads) - sum(width - 1 for width in widths)
    assert round_trips <= 6, (
        f"assemble now takes {round_trips} sequential round trips. Depth is what "
        "made this route 5,882ms: nineteen reads, none of them concurrent."
    )


def test_a_third_band_does_not_multiply_the_skill_reads() -> None:
    """The collapse that matters: shared lookups are read ONCE, not per band."""
    _, reads = _assemble()

    for table in ("skills", "user_skills", "skill_assessed_level", "skill_questions"):
        assert reads.count(table) == 1, (
            f"{table} was read {reads.count(table)} times for three bands. The bands "
            "differ only by seniority — union their demand and look the skills up once."
        )
    # One market read per band is the irreducible part: different seniority, different rows.
    assert reads.count("rpc:role_family_band_market_skills") == 3


def test_band_maps_stay_identical_after_the_collapse() -> None:
    """Behaviour lock: the payload must not change, only the read shape."""
    payload, _ = _assemble()

    anchor = payload["anchor"]
    assert anchor["job_count"] == 100
    assert [card["taxonomy_key"] for card in anchor["cards"]] == ["sql", "python"]

    sql, python = anchor["cards"]
    # sql: on the CV (evidence + matched level) -> current comes from the CV row.
    assert sql["state"] == "on_cv"
    assert sql["current_level"] == 3
    assert sql["display_name"] == "SQL"
    # python: no CV row, assessed only -> current comes from the assessment.
    assert python["state"] != "on_cv"
    assert python["current_level"] == 2
    # No ladder rows seeded, so nothing is practice-complete.
    assert sql["ladder_complete"] is False
    assert python["next_practice_level"] is None
