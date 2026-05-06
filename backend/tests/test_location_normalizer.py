from app.services.location_normalizer import normalize_location


def test_normalize_location_maps_bangalore_aliases_to_bengaluru() -> None:
    normalized = normalize_location("Bangalore, India")
    assert normalized.location_city == "Bengaluru"
    assert normalized.location_country == "India"
    assert normalized.location_mode == "onsite"
    assert normalized.location_quality == "ok"
    assert normalized.location == "Bengaluru, India"


def test_normalize_location_detects_remote_mode() -> None:
    normalized = normalize_location("Remote - Worldwide")
    assert normalized.location_mode == "remote"
    assert normalized.location_quality == "ok"
    assert normalized.location == "Remote"


def test_normalize_location_marks_ambiguous_multi_location_unknown() -> None:
    normalized = normalize_location("3 Locations")
    assert normalized.location_mode == "unknown"
    assert normalized.location_quality == "unknown"
    assert normalized.location_city is None
    assert normalized.location == "3 Locations"
