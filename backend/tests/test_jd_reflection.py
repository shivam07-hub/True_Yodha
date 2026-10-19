"""JD Reflection — named tools are a string fact; everything else is the judge's.

ARCHITECTURE_JD_REFLECTION.md §0 (2026-10-19). The tool pairs are the PwC DTDS
paper (738091WD): Tableau on the skills line proves a tool list a dashboard
bullet does not. Whether a sales pipeline proves a data pipeline is no longer a
string question — the judge rules it, and this module only writes its prompt
and reads its answer.
"""

import json

from app.services.jd_reflection import (
    Candidate,
    format_block,
    judge_messages,
    named_tools,
    names_a_tool,
    parse_verdicts,
    pointer_inside_source,
)

SKILLS = "Python, SQL, Snowflake, Google Analytics, Tableau, Excel, PowerPoint, PyCharm"
JLL = (
    "SPOC for 50+ enterprise clients (US & EMEA) on data and analytics, "
    "and engineered property-tech dashboards for capital allocation."
)
AZURE = (
    "Reduced platform maintenance spend by ~30% of the IT budget through "
    "Azure data-pipeline optimization."
)


# ── named tools ───────────────────────────────────────────────────────────────

def test_a_tool_list_is_proven_by_the_skills_line_not_by_a_dashboard_bullet():
    requirement = "Develop data-driven strategies using tools such as Alteryx, Power BI, and Tableau"
    assert named_tools(requirement) == ["Alteryx", "Power BI", "Tableau"]
    assert names_a_tool(requirement, SKILLS)
    assert not names_a_tool(requirement, JLL)


def test_a_line_naming_one_cloud_proves_an_alternative_cloud_list():
    requirement = "Experience with cloud platforms such as AWS, Azure, and GCP"
    assert names_a_tool(requirement, AZURE)


def test_an_or_list_of_named_tools_is_alternatives():
    requirement = "Automate manual workflows using SQL, Python, or scripting"
    assert named_tools(requirement) == ["SQL", "Python"]
    assert names_a_tool(requirement, SKILLS)
    assert not names_a_tool(requirement, "Wrote scripts to clean the weekly sales sheet")


def test_a_requirement_that_offers_no_tools_goes_to_the_judge():
    """Not alternatives: a certification, a company, a pair of tools joined by
    "and". The string rule has nothing to say about these."""
    for requirement in (
        "A certification in cloud platforms (AWS, Azure, GCP)",
        "Drive co-sell execution across Microsoft and partners",
        "Develop interactive dashboards using Sigma and Snowflake",
        "Build and maintain self-serve dashboards with real-time visibility",
        "Plan and budget projects to meet timelines and quality standards",
    ):
        assert named_tools(requirement) is None, requirement
        assert not names_a_tool(requirement, SKILLS + " " + JLL + " " + AZURE)


def test_a_tool_must_be_a_whole_token():
    requirement = "Proficiency in a language such as Go, Rust, or Java"
    assert not names_a_tool(requirement, "Organised a Javascript meetup and good governance reviews")
    assert names_a_tool(requirement, "Rewrote the billing service in Rust")


# ── the judge's prompt and answer ────────────────────────────────────────────

BATCH = [
    ("Build and maintain self-serve dashboards with real-time visibility", [
        Candidate("1a", "Built property-management dashboards for 50+ enterprise clients"),
        Candidate("1b", "Owned the India GTM plan for GCC clients"),
    ]),
    ("Plan and budget projects to meet timelines", [
        Candidate("2a", "Owned the India GTM plan for GCC clients"),
    ]),
]


def test_the_prompt_carries_every_requirement_with_its_own_lines():
    messages = judge_messages(BATCH)
    assert messages[0]["role"] == "system"
    assert "Shared words are not proof" in messages[0]["content"]
    assert "When unsure, the line does not prove it" in messages[0]["content"]
    body = messages[1]["content"]
    assert "1. Build and maintain self-serve dashboards" in body
    assert "[1a] Built property-management dashboards" in body
    assert "2. Plan and budget projects" in body
    assert "[2a] Owned the India GTM plan" in body


def _shown(line_id, words):
    return {"id": line_id, "shows": words}


def test_verdicts_are_read_per_requirement():
    raw = (
        '```json\n{"proven": {"1": [{"id": "1a", "shows": "property-management dashboards"}],'
        ' "2": []}}\n```'
    )
    assert parse_verdicts(raw, BATCH) == [{"1a"}, set()]


def test_the_judge_cannot_cite_a_line_it_was_not_offered_for_that_requirement():
    raw = json.dumps({"proven": {
        "1": [_shown("1a", "Built property-management"), _shown("2a", "India GTM plan"), _shown("9z", "x y")],
        "2": [_shown("1b", "India GTM plan")],
    }})
    assert parse_verdicts(raw, BATCH) == [{"1a"}, set()]


def test_a_proof_must_quote_words_that_are_in_the_line():
    """The judge has to point at the evidence. A quote the line does not
    contain, a one-word quote, or a bare id is not a proof."""
    raw = json.dumps({"proven": {"1": [
        _shown("1a", "real-time self-serve dashboards"),
        _shown("1b", "plan"),
        "1a",
    ]}})
    assert parse_verdicts(raw, BATCH) == [set(), set()]


def test_an_unreadable_answer_is_not_a_verdict():
    """A failed judge must not read as "nothing proves it"."""
    assert parse_verdicts("I think the first line fits.", BATCH) is None
    assert parse_verdicts('{"other": {}}', BATCH) is None
    assert parse_verdicts("", BATCH) is None


def test_a_missing_requirement_number_is_unproven():
    raw = json.dumps({"proven": {"1": [_shown("1b", "India GTM plan")]}})
    assert parse_verdicts(raw, BATCH) == [{"1b"}, set()]


# ── Match Eval facts come from the panel ────────────────────────────────────

def test_format_block_names_the_line_and_leaves_the_gap():
    block = format_block([
        ("Tools such as Alteryx, Power BI, and Tableau", SKILLS),
        ("A certification in cloud platforms (AWS, Azure, GCP)", None),
    ])
    assert "Motions this person's own lines prove:" in block
    assert "Tableau" in block
    assert "Motions still unproven:\n- A certification in cloud platforms" in block


def test_format_block_is_empty_with_nothing_to_say():
    assert format_block([]) == ""
    assert format_block([("", None)]) == ""


# ── pointer_inside_source (reservoir writer guard, unchanged) ───────────────

def test_a_paraphrase_is_not_inside_the_answer():
    source = "I own the India territory for 2 years across 12 cities."
    assert pointer_inside_source(source, source)
    assert not pointer_inside_source(source, "Engineered a robust inbound pipeline across the region.")
    assert not pointer_inside_source(source, "Ran proposals")


def test_a_trailing_comma_from_the_model_is_still_a_verdict():
    """Measured on the judgment lane, 2026-10-19: the model closed a 12-item
    answer with '"11": [],\\n}}'. Strict JSON refused the whole panel."""
    raw = '{"proven": {\n"1": [{"id": "1a", "shows": "Built property-management"},],\n"2": [],\n}}'
    assert parse_verdicts(raw, BATCH) == [{"1a"}, set()]
