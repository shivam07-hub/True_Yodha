from app.routers.jobs.apply import _preview_fit


def _skill(label: str, key: str | None):
    return {"label": label, "taxonomy_key": key}


def test_preview_fit_full_match():
    primary = [_skill("Python", "python"), _skill("SQL", "sql")]
    secondary = [_skill("Docker", "docker")]
    user = {"python": 3, "sql": 4, "docker": 2}
    fit = _preview_fit(primary, secondary, user)
    assert fit["readiness_pct"] == 100.0
    assert fit["top_gaps"] == []
    assert set(fit["matched_skills"]) == {"Python", "SQL", "Docker"}


def test_preview_fit_partial_weights_primary_double():
    # one of two primaries matched, secondary unmatched:
    # got = 2*1 + 0 = 2 ; max = 2*2 + 1 = 5 → 40%
    primary = [_skill("Python", "python"), _skill("Snowflake", "snowflake")]
    secondary = [_skill("Docker", "docker")]
    user = {"python": 3}
    fit = _preview_fit(primary, secondary, user)
    assert fit["readiness_pct"] == 40.0
    # unmatched primaries surface as the top gaps
    assert fit["top_gaps"] == ["Snowflake"]


def test_preview_fit_caps_gaps_at_two():
    primary = [_skill(f"S{i}", f"s{i}") for i in range(5)]
    fit = _preview_fit(primary, [], {})
    assert fit["readiness_pct"] == 0.0
    assert len(fit["top_gaps"]) == 2


def test_preview_fit_null_when_no_taxonomy_skills():
    # skills without taxonomy keys → unknown fit, not zero
    primary = [_skill("Vibes", None)]
    fit = _preview_fit(primary, [], {"python": 3})
    assert fit["readiness_pct"] is None
    assert fit["matched_skills"] == []
    assert fit["top_gaps"] == []
