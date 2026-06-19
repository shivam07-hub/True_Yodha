"""Deterministic, fact-bounded starter CV generation."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


_QUESTION_FIELDS: dict[int, tuple[str, ...]] = {
    1: ("preferred_name", "email", "phone", "location", "linkedin_url"),
    2: ("roles", "projects"),
    3: ("achievements",),
    4: ("skills", "projects"),
    5: ("education", "certifications"),
}


@dataclass(frozen=True)
class GeneratedBaseline:
    draft: str
    source_ids: list[str]


def _clean_text(value: Any, *, limit: int = 500) -> str:
    if not isinstance(value, str):
        raise ValueError("Answers must be text")
    return " ".join(value.strip().split())[:limit]


def _clean_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        raise ValueError("Expected a list of answers")
    return [text for item in value[:20] if (text := _clean_text(item))]


def _clean_roles(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        raise ValueError("Expected a list of roles")
    roles: list[dict[str, str]] = []
    for item in value[:10]:
        if not isinstance(item, dict):
            raise ValueError("Each role must be structured")
        role = {
            field: _clean_text(item.get(field, ""))
            for field in ("title", "organization", "dates")
        }
        if any(role.values()):
            roles.append(role)
    return roles


def validate_answer(step: int, answer: dict[str, Any]) -> dict[str, Any]:
    fields = _QUESTION_FIELDS.get(step)
    if fields is None:
        raise ValueError("Question must be between 1 and 5")
    if not isinstance(answer, dict):
        raise ValueError(f"Question {step} answer must be an object")
    try:
        if step == 1:
            return {
                field: _clean_text(answer[field])
                for field in fields
                if field in answer
            }
        if step == 2:
            return {
                "roles": _clean_roles(answer.get("roles", [])),
                "projects": _clean_list(answer.get("projects", [])),
            }
        key = "achievements" if step == 3 else None
        if key:
            return {key: _clean_list(answer.get(key, []))}
        if step == 4:
            return {
                "skills": _clean_list(answer.get("skills", [])),
                "projects": _clean_list(answer.get("projects", [])),
            }
        return {
            "education": _clean_list(answer.get("education", [])),
            "certifications": _clean_list(answer.get("certifications", [])),
        }
    except ValueError as exc:
        raise ValueError(f"Question {step}: {exc}") from exc


def _append_list(
    lines: list[str],
    source_ids: list[str],
    heading: str,
    step: int,
    field: str,
    values: list[str],
) -> None:
    if not values:
        return
    lines.extend(["", heading])
    for index, value in enumerate(values):
        lines.append(f"- {value}")
        source_ids.append(f"{step}.{field}.{index}")


def generate_baseline(answers: dict[str, dict[str, Any]]) -> GeneratedBaseline:
    normalized = {
        str(step): validate_answer(step, answers.get(str(step), {}))
        for step in range(1, 6)
    }
    substantive = any(
        value
        for step in ("2", "3", "4", "5")
        for value in normalized[step].values()
    )
    if not substantive:
        raise ValueError("Add at least one substantive experience or qualification")

    lines: list[str] = []
    source_ids: list[str] = []
    identity = normalized["1"]
    if identity.get("preferred_name"):
        lines.append(identity["preferred_name"])
        source_ids.append("1.preferred_name")
    contacts = [
        identity[field]
        for field in ("location", "email", "phone", "linkedin_url")
        if identity.get(field)
    ]
    if contacts:
        lines.append(" | ".join(contacts))
        source_ids.extend(
            f"1.{field}"
            for field in ("location", "email", "phone", "linkedin_url")
            if identity.get(field)
        )

    roles = normalized["2"]["roles"]
    if roles:
        lines.extend(["", "EXPERIENCE"])
        for index, role in enumerate(roles):
            parts = [role[key] for key in ("title", "organization", "dates") if role[key]]
            lines.append(" | ".join(parts))
            source_ids.extend(
                f"2.roles.{index}.{key}"
                for key in ("title", "organization", "dates")
                if role[key]
            )

    _append_list(lines, source_ids, "ACHIEVEMENTS", 3, "achievements", normalized["3"]["achievements"])
    skills = normalized["4"]["skills"]
    if skills:
        lines.extend(["", "SKILLS", ", ".join(skills)])
        source_ids.extend(f"4.skills.{index}" for index in range(len(skills)))
    projects = [*normalized["2"]["projects"], *normalized["4"]["projects"]]
    _append_list(lines, source_ids, "PROJECTS", 4, "projects", projects)
    _append_list(lines, source_ids, "EDUCATION", 5, "education", normalized["5"]["education"])
    _append_list(
        lines,
        source_ids,
        "CERTIFICATIONS",
        5,
        "certifications",
        normalized["5"]["certifications"],
    )
    return GeneratedBaseline(draft="\n".join(lines).strip(), source_ids=source_ids)
