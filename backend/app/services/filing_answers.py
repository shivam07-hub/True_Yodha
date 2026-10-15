"""Answers for one company-page form.

Contact fields are copied from the tailored CV. Notice period, CTC, location,
and relocation are copied from the career profile. A dropdown is answered only
when one of its options is that stored fact. Every other question goes to the
writer with the CV as the only source. BLANK means the source does not contain
the answer, and that field stays empty.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any

from app.services.cv_structured_shape import has_content, normalize_structured

BLANK = "BLANK"
_CV_CHARS = 6000
_QUESTION_CHARS = 500
_ANSWER_CHARS = 1200

Complete = Callable[[list[dict[str, str]]], Awaitable[str]]


@dataclass(frozen=True)
class FormQuestion:
    id: str
    label: str
    options: tuple[str, ...] = ()


@dataclass(frozen=True)
class FormAnswer:
    id: str
    label: str
    answer: str
    source: str


def logistics_field(label: str) -> str | None:
    """The career-profile key this label asks for, or None."""
    text = " ".join(label.lower().replace("*", " ").split())
    if _has(text, "notice"):
        return "notice_period_days"
    if _has(text, "relocat"):
        return "open_to_relocate"
    money = any(_has(text, word) for word in ("ctc", "salary", "compensation"))
    if money and _has(text, "variable"):
        return "current_ctc_variable_lpa"
    if money and any(_has(text, word) for word in ("expected", "desired")):
        return "expected_ctc_lpa"
    if money and any(_has(text, word) for word in ("current", "present")):
        return "current_ctc_fixed_lpa"
    if _has(text, "years") and _has(text, "experience"):
        return "total_experience_years"
    return None


def logistics_value(profile: Mapping[str, Any], field: str) -> str:
    raw = profile.get(field)
    if field == "open_to_relocate":
        if raw is True:
            return "Yes"
        if raw is False:
            return "No"
        return ""
    if raw is None or isinstance(raw, bool):
        return ""
    if isinstance(raw, float) and raw.is_integer():
        return str(int(raw))
    return str(raw).strip()


def match_option(answer: str, options: list[str]) -> str:
    """The option that is the stored fact, or empty when none is."""
    wanted = answer.strip().lower()
    if not wanted:
        return ""
    for option in options:
        if option.strip().lower() == wanted:
            return option.strip()
    tokens = set(re.findall(r"[a-z0-9]+", wanted))
    if not tokens:
        return ""
    hits = [
        option.strip()
        for option in options
        if tokens <= set(re.findall(r"[a-z0-9]+", option.lower()))
    ]
    if len(hits) == 1:
        return hits[0]
    return ""


def known_field(label: str) -> str | None:
    """The contact key this label asks for, or None when a writer should answer."""
    text = " ".join(label.lower().replace("*", " ").split())
    if _has(text, "email") or "e-mail" in text:
        return "email"
    if any(_has(text, word) for word in ("phone", "mobile", "telephone")):
        return "phone"
    if _has(text, "linkedin"):
        return "linkedin"
    if _has(text, "first") and _has(text, "name"):
        return "first"
    if _has(text, "last") and _has(text, "name"):
        return "last"
    if _has(text, "surname"):
        return "last"
    if _has(text, "city") or _has(text, "location"):
        if any(_has(text, word) for word in ("job", "office", "company", "role")):
            return None
        return "location"
    if text in {"name", "full name", "your name"} or "full name" in text:
        return "name"
    return None


def contact_value(contact: Mapping[str, Any], field: str) -> str:
    if field == "first":
        return _split_name(str(contact.get("name") or ""))[0]
    if field == "last":
        return _split_name(str(contact.get("name") or ""))[1]
    return str(contact.get(field) or "").strip()


def plain_cv(structured: Mapping[str, Any] | None, body_text: str) -> str:
    if isinstance(structured, Mapping) and has_content(structured):
        return _render(normalize_structured(dict(structured)))
    if isinstance(body_text, str):
        return body_text.strip()
    return ""


def writer_messages(cv_text: str, question: str) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "Answer the application question using only the CV below. "
                "If the CV does not contain the answer, reply with the single word BLANK. "
                "Use the person's own details. Do not add employers, dates, titles, or skills "
                "that the CV does not contain."
            ),
        },
        {
            "role": "user",
            "content": (
                f"CV:\n{cv_text[:_CV_CHARS]}\n\nQuestion:\n{question[:_QUESTION_CHARS]}"
            ),
        },
    ]


def parse_writer(raw: str) -> str:
    text = raw.strip().strip('"').strip()
    if not text:
        return ""
    first = text.split()[0].strip(".,:").upper()
    if first == BLANK:
        return ""
    return text[:_ANSWER_CHARS]


async def answer_questions(
    *,
    structured: Mapping[str, Any] | None,
    body_text: str,
    questions: list[FormQuestion],
    complete: Complete,
    profile: Mapping[str, Any] | None = None,
) -> list[FormAnswer]:
    contact = normalize_structured(dict(structured) if isinstance(structured, Mapping) else {}).get(
        "contact"
    ) or {}
    facts = profile if isinstance(profile, Mapping) else {}
    cv_text = plain_cv(structured, body_text)
    answers: list[FormAnswer] = []
    for question in questions:
        options = [item.strip() for item in question.options if item.strip()]
        logistics = logistics_field(question.label)
        if logistics is not None:
            text = logistics_value(facts, logistics)
            if options:
                text = match_option(text, options)
            answers.append(FormAnswer(
                id=question.id, label=question.label, answer=text, source="profile",
            ))
            continue
        field = known_field(question.label)
        if field is not None:
            source = "cv"
            text = contact_value(contact, field)
            if field == "location":
                located = str(facts.get("current_location") or "").strip()
                if located:
                    text = located
                    source = "profile"
            if options:
                text = match_option(text, options)
            answers.append(FormAnswer(
                id=question.id, label=question.label, answer=text, source=source,
            ))
            continue
        if options or not cv_text:
            answers.append(FormAnswer(id=question.id, label=question.label, answer="", source="writer"))
            continue
        raw = await complete(writer_messages(cv_text, question.label))
        text = parse_writer(raw)
        answers.append(FormAnswer(
            id=question.id, label=question.label, answer=text, source="writer",
        ))
    return answers


def _has(text: str, word: str) -> bool:
    return re.search(rf"\b{re.escape(word)}\b", text) is not None


def _split_name(name: str) -> tuple[str, str]:
    parts = name.strip().split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _render(structured: Mapping[str, Any]) -> str:
    lines: list[str] = []
    contact = structured.get("contact") if isinstance(structured.get("contact"), Mapping) else {}
    for key in ("name", "title", "email", "phone", "location", "linkedin"):
        value = str(contact.get(key) or "").strip()
        if value:
            lines.append(value)
    summary = str(structured.get("summary") or "").strip()
    if summary:
        lines.append(summary)
    skills = str(structured.get("skills_line") or "").strip()
    if skills:
        lines.append(skills)
    for item in structured.get("experience") or []:
        if not isinstance(item, Mapping):
            continue
        lines.append(
            " ".join(
                str(item.get(key) or "").strip()
                for key in ("role", "company", "dates", "location")
                if str(item.get(key) or "").strip()
            )
        )
        for bullet in item.get("bullets") or []:
            text = str(bullet).strip()
            if text:
                lines.append(text)
    for item in structured.get("education") or []:
        if isinstance(item, Mapping):
            lines.append(" ".join(str(item.get(key) or "") for key in item if str(item.get(key) or "").strip()))
        elif str(item).strip():
            lines.append(str(item).strip())
    for item in structured.get("projects") or []:
        if isinstance(item, Mapping):
            name = str(item.get("name") or item.get("title") or "").strip()
            if name:
                lines.append(name)
            for bullet in item.get("bullets") or []:
                text = str(bullet).strip()
                if text:
                    lines.append(text)
        elif str(item).strip():
            lines.append(str(item).strip())
    certs = structured.get("certs")
    if isinstance(certs, str) and certs.strip():
        lines.append(certs.strip())
    elif isinstance(certs, list):
        lines.extend(str(item).strip() for item in certs if str(item).strip())
    return "\n".join(line for line in lines if line)
