"""Employer names and standalone metrics are not skills.

The extractor used to scan the whole CV, so a header like "BillDesk Spring" or
"Salesforce" became Spring Framework / Salesforce, and a metric bullet minted
KPI. The model then tagged almost every leftover as `project`, so every skill
showed the same 0.50 confidence. Evidence decides both whether the skill exists
and how strong it is.
"""

from __future__ import annotations

import pytest

from app.services.cv_explicit_skills import extract_explicit_skills
from app.services.cv_parser import _SIGNAL_XP, parse_cv_skills
from app.services.cv_skill_evidence import (
    apply_cv_evidence_rules,
    header_spans,
    signal_from_evidence,
    stray_skill_ids,
)
from app.services.llm_provider import LLMCompletion


SALESFORCE_CV = """\
Rupanjana Sharma
Bengaluru

EXPERIENCE

Salesforce
Account Executive
Jan 2023 – Present
- Closed 12 enterprise deals in the west region
- Increased authorisation success by 12%

Oracle Financial Services
Analyst
Jun 2020 – Dec 2022
- Wrote SQL reports for settlements

SKILLS
Python, SQL
"""


class _StaticSkillsProvider:
    def __init__(self, response: str) -> None:
        self._response = response

    async def complete_with_metadata(
        self,
        _messages: list[dict],
        max_tokens: int = 4096,
        temperature: float | None = None,
    ) -> LLMCompletion:
        return LLMCompletion(content=self._response, model="test/model", elapsed_ms=1)


def test_date_adjacent_company_and_title_lines_are_headers() -> None:
    spans = header_spans(SALESFORCE_CV)
    covered = " ".join(SALESFORCE_CV[start:end] for start, end in spans)
    assert "Salesforce" in covered
    assert "Oracle Financial Services" in covered
    assert "Account Executive" in covered
    assert "Closed 12 enterprise deals" not in covered
    assert "Python, SQL" not in covered


def test_literal_extractor_skips_an_employer_that_is_also_a_taxonomy_skill() -> None:
    keys = {item["taxonomy_key"] for item in extract_explicit_skills(SALESFORCE_CV)}
    assert "Salesforce" not in keys
    assert "Python (Programming Language)" in keys
    assert "SQL (Programming Language)" in keys


def test_employer_header_and_metric_only_llm_skills_are_dropped() -> None:
    skills = apply_cv_evidence_rules(
        [
            {
                "taxonomy_key": "Salesforce",
                "signal_type": "project",
                "evidence": "Salesforce",
                "xp_awarded": 150,
            },
            {
                "taxonomy_key": "Spring Framework",
                "signal_type": "project",
                "evidence": "BillDesk Spring",
                "xp_awarded": 150,
            },
            {
                "taxonomy_key": "Key Performance Indicators (KPIs)",
                "signal_type": "impact",
                "evidence": "Increased authorisation success by 12%",
                "xp_awarded": 350,
            },
            {
                "taxonomy_key": "SQL (Programming Language)",
                "signal_type": "mention",
                "evidence": "Wrote SQL reports for settlements",
                "xp_awarded": 50,
            },
        ],
        SALESFORCE_CV,
        _SIGNAL_XP,
    )
    keys = {item["taxonomy_key"] for item in skills}
    assert keys == {"SQL (Programming Language)"}
    assert skills[0]["signal_type"] == "project"
    assert skills[0]["xp_awarded"] == _SIGNAL_XP["project"]


def test_signal_type_is_read_from_the_evidence_not_the_model() -> None:
    assert signal_from_evidence("Python, SQL", "Python (Programming Language)") == "mention"
    assert (
        signal_from_evidence(
            "Built payment APIs in Java",
            "Java (Programming Language)",
        )
        == "project"
    )
    assert (
        signal_from_evidence(
            "Reduced pipeline time by 40% using Python",
            "Python (Programming Language)",
        )
        == "impact"
    )
    assert (
        signal_from_evidence(
            "Led 4 engineers building Python services",
            "Python (Programming Language)",
        )
        == "leadership"
    )


def test_a_metric_bullet_that_names_the_skill_is_impact_not_dropped() -> None:
    skills = apply_cv_evidence_rules(
        [
            {
                "taxonomy_key": "Python (Programming Language)",
                "signal_type": "mention",
                "evidence": "Reduced pipeline time by 40% using Python",
                "xp_awarded": 50,
            }
        ],
        "EXPERIENCE\nEngineer\nJan 2023 – Present\n- Reduced pipeline time by 40% using Python\n",
        _SIGNAL_XP,
    )
    assert len(skills) == 1
    assert skills[0]["signal_type"] == "impact"


@pytest.mark.asyncio
async def test_parse_cv_skills_does_not_keep_header_or_metric_inventions() -> None:
    provider = _StaticSkillsProvider(
        "["
        '{"taxonomy_key":"Salesforce","signal_type":"project","evidence":"Salesforce"},'
        '{"taxonomy_key":"Key Performance Indicators (KPIs)","signal_type":"impact",'
        '"evidence":"Increased authorisation success by 12%"},'
        '{"taxonomy_key":"SQL (Programming Language)","signal_type":"project",'
        '"evidence":"Wrote SQL reports for settlements"}'
        "]"
    )
    out = await parse_cv_skills(SALESFORCE_CV, provider=provider)
    keys = {item["taxonomy_key"] for item in out["skills_detected"]}
    assert "Salesforce" not in keys
    assert "Key Performance Indicators (KPIs)" not in keys
    assert "SQL (Programming Language)" in keys
    sql = next(item for item in out["skills_detected"] if item["taxonomy_key"].startswith("SQL"))
    assert sql["signal_type"] == "project"


def test_stray_skill_ids_drops_the_employer_and_keeps_a_named_skill() -> None:
    receipts = [
        {"skill_id": 1, "taxonomy_key": "Salesforce", "evidence_text": "Salesforce", "source": "cv"},
        {"skill_id": 2, "taxonomy_key": "Python (Programming Language)", "evidence_text": "Python", "source": "cv"},
    ]
    assert stray_skill_ids(receipts, SALESFORCE_CV) == [1]


def test_stray_skill_ids_will_not_leave_a_profile_empty() -> None:
    receipts = [
        {"skill_id": 1, "taxonomy_key": "Salesforce", "evidence_text": "Salesforce", "source": "cv"},
    ]
    assert stray_skill_ids(receipts, SALESFORCE_CV) == []


# Evidence → whether that row may be written to user_skills.
# The first five are skills stored off a real CV on 2026-09-19. Two of them
# already failed evidence_names_skill; the other three were the holes.
_WRITE_CASES = [
    (
        "business-education",
        "Grew the VAS business\nEDUCATION\n",
        "Business Education",
        "business\nEDUCATION",
        False,
    ),
    (
        "artificial-intelligence",
        "Built an AI chatbot fulfillment flow for returns\n",
        "Artificial Intelligence",
        "AI chatbot fulfillment",
        False,
    ),
    (
        "natural-language-processing",
        "Ran an NLP audit of 5K inputs before launch\n",
        "Natural Language Processing (NLP)",
        "NLP audit of 5K inputs",
        False,
    ),
    (
        "team-management",
        "Led end-to-end GTM for the payments launch\n",
        "Team Management",
        "Led end-to-end GTM",
        False,
    ),
    (
        "food-technology",
        "EDUCATION\nB.E. Food Technology\nAnna University\n",
        "Food Technology",
        "Food Technology",
        False,
    ),
    (
        "sql-named-in-a-bullet",
        "Wrote SQL reports for settlements\n",
        "SQL (Programming Language)",
        "Wrote SQL reports for settlements",
        True,
    ),
    (
        "html-abbreviation-is-the-receipt",
        "SKILLS\nHTML, CSS\n",
        "HyperText Markup Language (HTML)",
        "HTML",
        True,
    ),
]


@pytest.mark.parametrize(
    ("label", "cv_text", "skill", "evidence", "may_write"),
    _WRITE_CASES,
    ids=[case[0] for case in _WRITE_CASES],
)
def test_write_seam_requires_the_receipt_to_name_the_skill(
    label: str, cv_text: str, skill: str, evidence: str, may_write: bool,
) -> None:
    from app.services.cv_skill_evidence import rows_for_user_skills_write

    written = rows_for_user_skills_write(
        [{
            "user_id": "u1",
            "skill_id": 1,
            "taxonomy_key": skill,
            "source": "cv",
            "evidence_text": evidence,
        }],
        cv_text,
    )
    assert bool(written) is may_write, label
    if written:
        assert "taxonomy_key" not in written[0]


def test_literal_extractor_does_not_join_a_word_to_the_next_heading() -> None:
    cv = "Grew the VAS business\nEDUCATION\nB.E. Food Technology\n"
    keys = {item["taxonomy_key"] for item in extract_explicit_skills(cv)}
    assert "Business Education" not in keys
    assert "Food Technology" not in keys
