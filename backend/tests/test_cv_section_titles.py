"""A person renames a CV section once, and every render says it.

2026-09-28: Shivam applied with "Advisory and Agentic Pursuits" on a PDF he
built outside Myro, because Myro could only print "Projects". The DOCX had a
second defect: its request model had no `order`, so pydantic dropped the section
order the preview sent and every .docx came out in the default order.
"""
from __future__ import annotations

from io import BytesIO

from docx import Document

from app.routers.cv.export import CVDocxRequest
from app.schemas.users import UpdateProfileRequest
from app.services.cv_docx import generate_cv_docx
from app.services.cv_section_order import (
    DEFAULT_SECTION_TITLES,
    MAX_SECTION_TITLE,
    normalize_section_titles,
    section_title,
)


def test_known_keys_trimmed_capped_and_defaults_dropped() -> None:
    assert normalize_section_titles({
        "projects": "  Projects   and Agentic Pursuits ",
        "experience": "EXPERIENCE",
        "certs": "",
        "bogus": "x",
    }) == {"projects": "Projects and Agentic Pursuits"}
    assert len(normalize_section_titles({"summary": "y" * 90})["summary"]) == MAX_SECTION_TITLE


def test_an_absent_heading_is_the_default() -> None:
    assert section_title("projects", {"projects": "Side ventures"}) == "Side ventures"
    assert section_title("education", {"projects": "Side ventures"}) == DEFAULT_SECTION_TITLES["education"]
    assert section_title("skills_line", None) == "Skills"


def test_the_profile_write_normalises_and_empty_resets() -> None:
    body = UpdateProfileRequest(cv_section_titles={"projects": " Projects and Agentic Pursuits ", "x": "y"})
    assert body.cv_section_titles == {"projects": "Projects and Agentic Pursuits"}
    assert UpdateProfileRequest(cv_section_titles={}).cv_section_titles == {}
    assert UpdateProfileRequest().cv_section_titles is None  # untouched when not sent


def test_the_docx_request_keeps_order_and_headings() -> None:
    body = CVDocxRequest.model_validate({
        "visible": {"order": ["projects", "experience"], "titles": {"projects": "Pursuits"}},
    })
    dumped = body.visible.model_dump()
    assert dumped["order"] == ["projects", "experience"]
    assert dumped["titles"] == {"projects": "Pursuits"}


def _headings(docx_bytes: bytes) -> list[str]:
    doc = Document(BytesIO(docx_bytes))
    return [
        p.text for p in doc.paragraphs
        if p.runs and p.runs[0].bold and p.text.isupper() and len(p.text) > 2
    ]


def test_the_docx_prints_the_renamed_heading_in_the_previewed_order() -> None:
    visible = {
        "summary": "",
        "experience": [{"role": "GTM Manager", "company": "Capgemini", "dates": "2025", "bullets": ["Won Alstom"]}],
        "projects": [{"name": "Myro", "dates": "2026", "bullets": ["Built it"]}],
        "education": [],
        "skills_line": "",
        "certs": [],
        "order": ["projects", "experience"],
        "titles": {"projects": "Projects and Agentic Pursuits"},
    }
    heads = _headings(generate_cv_docx(visible, {"name": "Shivam"}))
    assert heads[:2] == ["PROJECTS AND AGENTIC PURSUITS", "EXPERIENCE"]
