"""A master rewrite keeps the sections the seven keys cannot hold."""
from app.services.cv_compose import render_deterministic
from app.services.cv_structured_shape import BLANK_CONTACT

_FIVE = (
    "LEADERSHIP ROLES",
    "RECOGNITIONS & ACHIEVEMENTS",
    "PERSONAL DETAILS",
    "AWARDS & ACTIVITIES",
    "CERTIFICATIONS & ACHIEVEMENTS",
)

_PREVIOUS = """\
Ada Lovelace
ada@x.io

SUMMARY
Builds things.

PROFESSIONAL EXPERIENCE
Intern · Capgemini · 2020 – 2022
• Did the work.

LEADERSHIP ROLES
• Led the club

RECOGNITIONS & ACHIEVEMENTS
• Dean's list

PERSONAL DETAILS
Date of birth: 1 Jan 1990

AWARDS & ACTIVITIES
• Debate

CERTIFICATIONS & ACHIEVEMENTS
• AWS associate

Leadership Roles
• Title-case heading still counts
"""


def _cv() -> dict:
    return {
        "contact": {**BLANK_CONTACT, "name": "Ada Lovelace", "email": "ada@x.io"},
        "summary": "Builds things.",
        "education": [],
        "experience": [{
            "company": "Capgemini",
            "role": "Intern",
            "dates": "2020 – 2022",
            "location": "",
            "bullets": ["Did the work."],
        }],
        "projects": [],
        "skills_line": None,
        "certs": [],
    }


def test_the_five_measured_headings_survive_a_rewrite() -> None:
    rewritten = render_deterministic(_cv(), carry_unknown_from=_PREVIOUS)
    cursor = 0
    for heading in _FIVE:
        found = rewritten.find(heading)
        assert found > cursor, heading
        cursor = found
    assert "Led the club" in rewritten
    assert "Dean's list" in rewritten
    assert "Date of birth: 1 Jan 1990" in rewritten
    assert "Debate" in rewritten
    assert "AWS associate" in rewritten
    assert "Title-case heading still counts" in rewritten
    # An alias of experience stays with the rendered EXPERIENCE block.
    assert rewritten.count("PROFESSIONAL EXPERIENCE") == 0
    assert rewritten.count("LEADERSHIP ROLES") == 1


def test_a_second_rewrite_does_not_repeat_them() -> None:
    once = render_deterministic(_cv(), carry_unknown_from=_PREVIOUS)
    twice = render_deterministic(_cv(), carry_unknown_from=once)
    assert twice.count("LEADERSHIP ROLES") == 1
    assert twice.count("CERTIFICATIONS & ACHIEVEMENTS") == 1
    assert twice.count("EXPERIENCE") == 1
