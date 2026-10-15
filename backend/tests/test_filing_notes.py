"""Two notes after confirmation, from the person's own export (ADR-0026 step 8)."""

from __future__ import annotations

from app.services.filing_notes import motion_match, written_to_choices


def _conn(name: str, position: str) -> dict[str, str]:
    return {"full_name": name, "position": position, "company": "Microsoft"}


def test_written_to_choices_lists_every_named_connection() -> None:
    rows = [_conn("Asha Rao", "Partner Solution Sales"), _conn("Dev Khanna", "Recruiter")]
    choices = written_to_choices(rows)
    assert [c.full_name for c in choices] == ["Asha Rao", "Dev Khanna"]
    assert choices[0].position == "Partner Solution Sales"


def test_a_row_with_no_name_is_dropped() -> None:
    rows = [{"full_name": "", "position": "Manager"}, _conn("Asha Rao", "Analyst")]
    assert [c.full_name for c in written_to_choices(rows)] == ["Asha Rao"]


def test_motion_match_picks_the_closest_seat() -> None:
    rows = [
        _conn("Dev Khanna", "Recruiter"),
        _conn("Asha Rao", "Partner Solution Sales Lead"),
    ]
    matched = motion_match(rows, function="Partner Solution Sales", target_titles=[])
    assert matched is not None
    assert matched.full_name == "Asha Rao"


def test_a_tie_keeps_the_first_in_export_order() -> None:
    rows = [
        _conn("First Match", "Data Analytics"),
        _conn("Second Match", "Data Analytics"),
    ]
    matched = motion_match(rows, function="Data Analytics", target_titles=[])
    assert matched is not None
    assert matched.full_name == "First Match"


def test_no_overlap_means_no_forced_match() -> None:
    rows = [_conn("Dev Khanna", "Recruiter")]
    assert motion_match(rows, function="Data Analytics", target_titles=[]) is None


def test_function_words_alone_do_not_tie_everyone() -> None:
    # "Senior" and "Manager" are stop words, so a shared seniority word is not a match.
    rows = [_conn("Dev Khanna", "Senior Manager Operations")]
    assert motion_match(rows, function="Senior Manager", target_titles=[]) is None
