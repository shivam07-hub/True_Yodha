"""Contact fields are copied. The writer is only asked what the CV must answer."""

from __future__ import annotations

import asyncio

from app.services.filing_answers import (
    FormQuestion,
    answer_questions,
    known_field,
    match_option,
    parse_writer,
    writer_messages,
)


def test_known_labels_stay_off_the_writer() -> None:
    assert known_field("Email address") == "email"
    assert known_field("Phone number") == "phone"
    assert known_field("Full name") == "name"
    assert known_field("First name") == "first"
    assert known_field("Last name") == "last"
    assert known_field("LinkedIn URL") == "linkedin"
    assert known_field("Current city") == "location"
    assert known_field("Company name") is None
    assert known_field("Why this role?") is None


def test_email_is_copied_and_a_blank_writer_answer_stays_empty() -> None:
    seen: list[str] = []

    async def complete(messages: list[dict[str, str]]) -> str:
        seen.append(messages[-1]["content"])
        return "BLANK. I would have to invent this."

    structured = {
        "contact": {
            "name": "Asha Rao",
            "email": "asha@example.com",
            "phone": "9999900000",
            "location": "Bengaluru",
            "linkedin": "",
            "title": "",
        },
        "summary": "Analyst.",
        "experience": [
            {
                "company": "Acme",
                "role": "Analyst",
                "dates": "2022",
                "location": "Bengaluru",
                "bullets": ["Built the weekly SQL report."],
            }
        ],
    }
    answers = asyncio.run(answer_questions(
        structured=structured,
        body_text="",
        questions=[
            FormQuestion(id="email", label="Email"),
            FormQuestion(id="why", label="Why this role?"),
        ],
        complete=complete,
    ))
    assert answers[0].answer == "asha@example.com"
    assert answers[0].source == "cv"
    assert answers[1].answer == ""
    assert answers[1].source == "writer"
    assert len(seen) == 1
    assert "Built the weekly SQL report." in seen[0]


def test_the_writer_is_told_to_stop_when_the_cv_lacks_the_answer() -> None:
    messages = writer_messages("Analyst at Acme.", "Expected CTC?")
    assert "BLANK" in messages[0]["content"]
    assert parse_writer("BLANK") == ""
    assert parse_writer("I built the weekly SQL report.") == "I built the weekly SQL report."


def test_notice_period_matches_one_option_and_skips_the_writer() -> None:
    async def complete(_messages: list[dict[str, str]]) -> str:
        raise AssertionError("the writer is not asked for a stored fact")

    answers = asyncio.run(answer_questions(
        structured={"contact": {"name": "Asha Rao", "location": "Pune"}},
        body_text="",
        questions=[
            FormQuestion(id="notice", label="Notice period", options=("15 days", "30 days")),
            FormQuestion(id="city", label="Current location"),
            FormQuestion(id="ctc", label="Expected CTC"),
        ],
        complete=complete,
        profile={
            "notice_period_days": 30,
            "current_location": "Bengaluru",
        },
    ))
    assert answers[0].answer == "30 days"
    assert answers[0].source == "profile"
    assert answers[1].answer == "Bengaluru"
    assert answers[1].source == "profile"
    assert answers[2].answer == ""
    assert answers[2].source == "profile"
    assert match_option("30", ["15 days", "30 days", "30+ days"]) == ""
    assert match_option("30", ["130 days"]) == ""
