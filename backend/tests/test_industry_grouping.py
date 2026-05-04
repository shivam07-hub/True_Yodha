from app.services.industry_grouping import normalize_industry_group


def test_prefers_explicit_industry_group_when_present() -> None:
    assert normalize_industry_group("Technology", "BFSI") == "Technology"


def test_derives_group_from_raw_industry_when_group_missing() -> None:
    assert normalize_industry_group(None, "IT Services & Consulting") == "Technology"
    assert normalize_industry_group(None, "Banking / Financial Services") == "BFSI"
    assert normalize_industry_group(None, "Pharmaceutical / Life Sciences") == "Healthcare & Life Sciences"


def test_defaults_to_diversified_for_unknown_industry_text() -> None:
    assert normalize_industry_group(None, "Something Totally New") == "Diversified"


def test_returns_none_when_both_values_missing() -> None:
    assert normalize_industry_group(None, None) is None
