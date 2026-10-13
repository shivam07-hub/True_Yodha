"""Location rules — CEO decision record 2026-10-04.

Q1 a job with no city is shown to everyone in its country.
Q2 a job naming only a state is shown to users whose cities are in that state.
Q6 "Delhi NCR" is the cities Delhi, Gurugram and Noida.

Admission (`location_compatible`) and the feed scope (`build_location_scope`)
must answer the same way. Cases are live rows from 2026-10-04: Kotak Mahindra
Bank posted 178 jobs located only "Maharashtra", 68 only "Haryana".
"""
from __future__ import annotations

from typing import Any

from app.repositories.jobs import build_location_scope
from app.services import location_vocab
from app.services.location_normalizer import normalize_location
from app.services.match_credibility import location_compatible


def _profile(*cities: str) -> dict[str, Any]:
    return {"target_locations": list(cities), "target_location_countries": ["India"]}


def _job(**over: Any) -> dict[str, Any]:
    base = {
        "location": "India — city not specified",
        "location_city": None,
        "location_country": "India",
        "location_mode": "onsite",
        "location_states": [],
    }
    base.update(over)
    return base


_KOTAK_MAHARASHTRA = _job(location="Maharashtra — city not specified", location_states=["Maharashtra"])
_KOTAK_HARYANA = _job(location="Haryana — city not specified", location_states=["Haryana"])
_SIEMENS_TWO_STATES = _job(
    location="Karnataka or Maharashtra — city not specified",
    location_states=["Karnataka", "Maharashtra"],
)


# ── Q1 ───────────────────────────────────────────────────────────────────────

def test_q1_country_only_job_reaches_every_city_user_in_that_country() -> None:
    assert location_compatible(_profile("Pune"), _job())
    assert location_compatible(_profile("Chennai"), _job())


def test_q1_does_not_change_remote_jobs() -> None:
    remote = _job(location="Remote - India", location_mode="remote")
    assert not location_compatible(_profile("Pune"), remote)
    assert location_compatible(_profile("Remote"), remote)


# ── Q2 ───────────────────────────────────────────────────────────────────────

def test_q2_state_only_job_reaches_users_in_that_state_only() -> None:
    assert location_compatible(_profile("Pune"), _KOTAK_MAHARASHTRA)
    assert location_compatible(_profile("Mumbai"), _KOTAK_MAHARASHTRA)
    assert not location_compatible(_profile("Bengaluru"), _KOTAK_MAHARASHTRA)


def test_q2_multi_state_job_reaches_either_state() -> None:
    assert location_compatible(_profile("Bengaluru"), _SIEMENS_TWO_STATES)
    assert location_compatible(_profile("Pune"), _SIEMENS_TWO_STATES)
    assert not location_compatible(_profile("Chennai"), _SIEMENS_TWO_STATES)


def test_q2_a_row_written_before_the_release_reads_the_same() -> None:
    legacy = _job(location="Maharashtra, India", location_city="Maharashtra", location_states=[])
    assert location_compatible(_profile("Pune"), legacy)
    assert not location_compatible(_profile("Bengaluru"), legacy)


# ── Q6 ───────────────────────────────────────────────────────────────────────

def test_q6_delhi_ncr_covers_gurugram_and_noida_city_jobs() -> None:
    for city in ("Gurugram", "Noida", "Delhi NCR"):
        job = _job(location=f"{city}, India", location_city=city, location_states=[])
        assert location_compatible(_profile("Delhi NCR"), job), city


def test_q6_delhi_ncr_does_not_take_haryana_or_up_state_only_jobs() -> None:
    assert not location_compatible(_profile("Delhi NCR"), _KOTAK_HARYANA)
    assert location_compatible(_profile("Delhi NCR"), _job(location_states=["Delhi"]))
    # A Gurugram user is in Haryana, so Haryana-only jobs reach them.
    assert location_compatible(_profile("Gurugram"), _KOTAK_HARYANA)


# ── feed scope agrees with admission ─────────────────────────────────────────

def test_feed_scope_for_a_city_adds_its_state_and_its_country() -> None:
    clause, sig = build_location_scope(["Pune, India"])
    assert "location_city.eq.Pune" in clause
    assert "and(location_city.is.null,location_mode.neq.remote,location_states.cs.{Maharashtra})" in clause
    assert (
        "and(location_city.is.null,location_mode.neq.remote,location_states.eq.{},location_country.eq.India)"
        in clause
    )
    assert sig == ("city:pune", "state:maharashtra", "no_city:india")


def test_feed_scope_for_delhi_ncr_is_three_cities_and_delhi_state() -> None:
    clause, sig = build_location_scope(["Delhi NCR"])
    for city in ("Delhi NCR", "Gurugram", "Noida"):
        assert f"location_city.eq.{city}" in clause
    assert "location_states.cs.{Delhi}" in clause
    assert "location_states.cs.{Haryana}" not in clause
    assert "location_states.cs.{Uttar Pradesh}" not in clause
    assert "state:delhi" in sig


def test_feed_country_chip_needs_no_separate_no_city_term() -> None:
    clause, _ = build_location_scope(["Pune", "India (All)"])
    assert "location_states.eq.{}" not in clause


# ── the label is display copy, not a place ───────────────────────────────────

def test_city_not_specified_label_never_parses_into_a_city() -> None:
    for label in (
        "India — city not specified",
        "Maharashtra — city not specified",
        "Karnataka or Maharashtra — city not specified",
    ):
        parsed = normalize_location(label)
        assert parsed.location_city is None, label
        assert parsed.location_country == "India", label


def test_a_state_is_never_a_city() -> None:
    assert normalize_location("Maharashtra, India").location_city is None


# ── a vocabulary outage fails closed, never raises ───────────────────────────

def test_vocab_outage_hides_state_only_jobs_but_keeps_country_only_jobs(monkeypatch) -> None:
    location_vocab.set_vocab(None)

    def down() -> list[dict[str, Any]]:
        raise RuntimeError("supabase unreachable")

    monkeypatch.setattr(location_vocab, "_fetch_rows", down)

    assert not location_compatible(_profile("Pune"), _KOTAK_MAHARASHTRA)
    assert location_compatible(_profile("Pune"), _job())
