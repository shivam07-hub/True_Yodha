"""Stage A extraction. Every precision case here is a real prod string."""

from __future__ import annotations

from app.services.skill_extraction import (
    ExtractedSkill,
    extract_skills,
    merge_zones,
    normalize_skill_label,
    suggest_skills,
)


def _keys(skills: list[ExtractedSkill]) -> list[str]:
    return [s.taxonomy_key for s in skills]


def test_a_job_with_a_real_description_always_yields_skills() -> None:
    # The invariant this module exists for: no job without skills. 6,252 prod
    # jobs had none while averaging 3,572 chars of description.
    found = extract_skills(
        "Senior Data Engineer",
        "Requirements:\nStrong Python and SQL. Experience with Apache Airflow.",
    )
    assert found
    assert "Python (Programming Language)" in _keys(found)


def test_must_have_zone_outranks_body_mentions() -> None:
    found = extract_skills(
        "Data Engineer",
        "About us: we love Tableau here.\n\nRequirements:\nStrong Python.",
    )
    zones = {s.taxonomy_key: s.zone for s in found}
    assert zones.get("Python (Programming Language)") == "must_have"
    assert zones.get("Tableau (Business Intelligence Software)") == "mentioned"


def test_preferred_heading_beats_must_have_on_the_same_line() -> None:
    # "Preferred qualifications" matches both patterns; the weaker claim wins,
    # or every optional block reads as a gate.
    found = extract_skills("Analyst", "Preferred qualifications:\nKnowledge of Tableau.")
    zones = {s.taxonomy_key: s.zone for s in found}
    assert zones.get("Tableau (Business Intelligence Software)") == "preferred"


def test_a_heading_does_not_claim_the_whole_document() -> None:
    # Prod: one "Requirements" line near the top made every skill in the
    # posting a gate. A blank line ends the block.
    body = "Requirements:\nStrong Python.\n\nAbout the team:\nWe use Tableau daily."
    zones = {s.taxonomy_key: s.zone for s in extract_skills("Engineer", body)}
    assert zones.get("Python (Programming Language)") == "must_have"
    assert zones.get("Tableau (Business Intelligence Software)") == "mentioned"


def test_hyphenated_compound_does_not_invent_a_phrase_skill() -> None:
    # Prod string: "flexible work-life support" produced the skill
    # "Life Support" on accounting and QA roles, because dropping the hyphen
    # glues `life` to `support` into a phrase the posting never wrote.
    found = extract_skills(
        "Senior Associate",
        "You'll benefit from inclusive development opportunities, flexible work-life support, paid volunteer days.",
    )
    assert "Life Support" not in _keys(found)


def test_lowercase_common_word_does_not_match_a_parenthesised_skill() -> None:
    # Prod: bare-form matching put "Tracking (Commercial Airline Flight)" and
    # "Scheme (Programming Language)" on a software role. Document frequency
    # cannot separate these — `python` is MORE common than `tracking` — so the
    # bare form is matched case-sensitively.
    found = _keys(
        extract_skills(
            "Software Engineer",
            "You will be tracking delivery progress and designing a scheme to track rollout.",
        )
    )
    assert "Tracking (Commercial Airline Flight)" not in found
    assert "Scheme (Programming Language)" not in found


def test_capitalised_proper_noun_still_matches_its_parenthesised_skill() -> None:
    # The other side of the same rule: case is the signal, so a posting that
    # writes the proper noun must still resolve.
    found = _keys(extract_skills("Engineer", "Requirements:\nWe write Python every day."))
    assert "Python (Programming Language)" in found


def test_longest_skill_claims_the_span() -> None:
    # Prod: "Business Transformation" also produced "Transformation (Genetics)"
    # on consulting roles. A longer name owns its words.
    found = _keys(
        extract_skills("Director", "Requirements:\nLead Change Management Strategy across the portfolio.")
    )
    assert "Change Management Strategy" in found
    assert "Change Management" not in found


def test_limit_applies_per_zone_not_in_total() -> None:
    body = "Requirements:\n" + ", ".join(["Python", "Java", "Tableau", "Salesforce"])
    found = extract_skills("Engineer", body, limit=2)
    assert len([s for s in found if s.zone == "must_have"]) <= 2


def test_empty_text_yields_nothing_rather_than_raising() -> None:
    assert extract_skills("", "") == []


def test_merge_zones_keeps_the_strongest_claim_once() -> None:
    # job_skills is UNIQUE (job_id, skill_id); a duplicate inside one upsert
    # batch is a Postgres error, not a silent dedupe.
    merged = merge_zones(
        [
            ExtractedSkill("Python (Programming Language)", "mentioned", 2, 0.68),
            ExtractedSkill("Python (Programming Language)", "must_have", 4, 0.82),
        ]
    )
    assert len(merged) == 1
    assert merged[0].zone == "must_have"


def test_suggest_skills_keeps_the_extension_preview_shape() -> None:
    preview = suggest_skills("Data Engineer", "Requirements:\nStrong Python.\n\nWe also use Tableau.")
    assert {"primary_skills", "secondary_skills", "emerging_skills"} == set(preview)
    assert all("taxonomy_key" in row and "confidence" in row for row in preview["primary_skills"])


def test_normalize_preserves_technical_tokens_and_hyphens() -> None:
    assert normalize_skill_label("  Node.js / C++  ") == "node.js c++"
    assert normalize_skill_label("E-Commerce") == "e-commerce"
