"""Compose CV text from cv_structured + hidden_items + edited_items.

Used by the new per-job CV Builder (Git-commit model). Frontend and backend MUST
agree on item_id derivation — keep both implementations in sync.

item_id scheme (Q10 lock):  stable across re-parse so long as content stays the same.
    {section_type}:{index}:{sha1_first_8_of_content_first_60_chars}
"""

from __future__ import annotations

import re
from typing import Any

from app.services.cv_contact import is_section_heading
from app.services.cv_section_order import normalize_section_order
from app.services.cv_structured_shape import is_blank

#: Headings the seven contract keys already render. An alias of one of them
#: stays with that key. Anything else the person wrote is carried verbatim.
_KNOWN_HEADINGS = frozenset({
    "summary", "professional summary", "profile", "objective", "about",
    "experience", "work experience", "professional experience", "employment",
    "employment history", "work history", "career history",
    "education", "academic background", "qualifications",
    "skills", "technical skills", "core skills", "key skills", "competencies",
    "core competencies",
    "projects", "personal projects", "academic projects",
    "certifications", "certificates", "licenses",
})
_JOINERS = frozenset({"and", "of", "the", "for"})


def _djb2(s: str) -> str:
    """djb2 hash over UTF-8 bytes, 32-bit, hex 8-char output. Same logic frontend-side."""
    h = 5381
    for b in s.encode("utf-8"):
        h = ((h * 33) + b) & 0xFFFFFFFF
    return f"{h:08x}"


def item_id(section_type: str, index: int, content: str) -> str:
    """Stable hash ID for a CV item (bullet or section). Mirrors frontend logic.

    Uses djb2 over UTF-8 bytes so frontend (TextEncoder + djb2) and backend agree
    without needing an async crypto.subtle.digest round-trip in the browser.
    """
    body = (content or "").strip()[:60].lower()
    return f"{section_type}:{index}:{_djb2(body)}"


def _norm_heading(line: str) -> str:
    return " ".join(re.sub(r"[^a-z ]", " ", line.casefold()).split())


def _next_nonempty(lines: list[str], index: int) -> str | None:
    for line in lines[index + 1:]:
        if line.strip():
            return line
    return None


def _is_bullet(line: str) -> bool:
    return line.strip().startswith(("•", "-", "*", "–"))


def _is_title_label(line: str) -> bool:
    """A short label, not a sentence and not a dated role line."""
    words = line.split()
    if not 2 <= len(words) <= 6:
        return False
    if any(ch.isdigit() or ch in ",.;:()" for ch in line):
        return False
    for word in words:
        bare = word.strip("&/-")
        if not bare or bare.casefold() in _JOINERS:
            continue
        if not bare[0].isupper():
            return False
    return True


def _is_block_heading(line: str, nxt: str | None) -> bool:
    stripped = line.strip()
    if not stripped or len(stripped) > 60:
        return False
    if stripped[0] in "•*-–" or "·" in stripped or "|" in stripped or "@" in stripped:
        return False
    if re.search(r"\d{4}", stripped):
        return False
    if is_section_heading(stripped):
        return True
    letters = re.sub(r"[^A-Za-z]", "", stripped)
    if (
        len(letters) >= 3
        and letters.isupper()
        and re.fullmatch(r"[A-Za-z][A-Za-z0-9 &/,'’.-]*", stripped)
    ):
        return True
    return bool(nxt and _is_bullet(nxt) and _is_title_label(stripped))


def unknown_sections(previous_body_text: str | None) -> str:
    """Blocks from a CV whose heading is not one of the seven contract sections.

    Kept verbatim, in the order they were written. A second rewrite of the
    text this returns does not repeat them: the same heading is found once.
    """
    if not previous_body_text:
        return ""
    lines = previous_body_text.splitlines()
    starts = [
        index for index, line in enumerate(lines)
        if line.strip() and _is_block_heading(line, _next_nonempty(lines, index))
    ]
    blocks: list[str] = []
    for position, start in enumerate(starts):
        heading = _norm_heading(lines[start])
        if heading in _KNOWN_HEADINGS:
            continue
        end = starts[position + 1] if position + 1 < len(starts) else len(lines)
        chunk = "\n".join(lines[start:end]).strip()
        if chunk:
            blocks.append(chunk)
    return "\n\n".join(blocks)


def render_deterministic(
    cv_structured: dict[str, Any],
    hidden_items: list[str] | None = None,
    edited_items: dict[str, str] | None = None,
    section_order: list[str] | None = None,
    carry_unknown_from: str | None = None,
) -> str:
    """Render cv_structured into a plain-text CV, skipping hidden items and applying edits.

    ``carry_unknown_from`` is the body this render replaces. Sections the seven
    keys cannot hold are appended in their original words.
    """
    hidden = set(hidden_items or [])
    edits = edited_items or {}

    def keep(iid: str) -> bool:
        return iid not in hidden

    def text_of(iid: str, fallback: str) -> str:
        return edits.get(iid, fallback)

    def summary_block() -> list[str]:
        if not cv_structured.get("summary"):
            return []
        iid = item_id("summary", 0, cv_structured["summary"])
        if not keep(iid):
            return []
        return ["SUMMARY", text_of(iid, cv_structured["summary"]), ""]

    def experience_block() -> list[str]:
        experience = cv_structured.get("experience") or []
        if not experience:
            return []
        kept_blocks: list[list[str]] = []
        for i, exp in enumerate(experience):
            kept_bullets: list[str] = []
            for j, bullet in enumerate(exp.get("bullets") or []):
                iid = item_id("exp_bullet", i * 100 + j, bullet)
                if keep(iid):
                    kept_bullets.append(text_of(iid, bullet))
            if not kept_bullets:
                continue
            block = [
                f"{exp.get('role') or ''} · {exp.get('company') or ''} · {exp.get('dates') or ''}".strip(" ·"),
            ]
            block.extend(f"• {b}" for b in kept_bullets)
            kept_blocks.append(block)
        if not kept_blocks:
            return []
        out = ["EXPERIENCE"]
        for block in kept_blocks:
            out.extend(block)
            out.append("")
        return out

    def projects_block() -> list[str]:
        projects = cv_structured.get("projects") or []
        if not projects:
            return []
        kept_blocks: list[list[str]] = []
        for i, proj in enumerate(projects):
            kept_bullets: list[str] = []
            for j, bullet in enumerate(proj.get("bullets") or []):
                iid = item_id("proj_bullet", i * 100 + j, bullet)
                if keep(iid):
                    kept_bullets.append(text_of(iid, bullet))
            if not kept_bullets:
                continue
            block = [f"{proj.get('name') or ''} · {proj.get('dates') or ''}".strip(" ·")]
            block.extend(f"• {b}" for b in kept_bullets)
            kept_blocks.append(block)
        if not kept_blocks:
            return []
        out = ["PROJECTS"]
        for block in kept_blocks:
            out.extend(block)
            out.append("")
        return out

    def education_block() -> list[str]:
        education = cv_structured.get("education") or []
        kept_edu: list[str] = []
        for i, edu in enumerate(education):
            id_line = f"{edu.get('institution','')} · {edu.get('degree','')} · {edu.get('dates','')}".strip(" ·")
            display = " · ".join(
                p for p in (
                    edu.get("institution", ""), edu.get("degree", ""),
                    edu.get("grade", ""), edu.get("dates", ""),
                ) if p
            )
            iid = item_id("edu", i, id_line)
            if keep(iid):
                kept_edu.append(text_of(iid, display))
        if not kept_edu:
            return []
        return ["EDUCATION", *kept_edu, ""]

    def skills_block() -> list[str]:
        if not cv_structured.get("skills_line"):
            return []
        iid = item_id("skills_line", 0, cv_structured["skills_line"])
        if not keep(iid):
            return []
        return ["SKILLS", text_of(iid, cv_structured["skills_line"]), ""]

    def certs_block() -> list[str]:
        certs = cv_structured.get("certs") or []
        kept_certs: list[str] = []
        for i, cert in enumerate(certs):
            iid = item_id("cert", i, cert)
            text = text_of(iid, cert)
            if keep(iid) and not is_blank(text):
                kept_certs.append(text)
        if not kept_certs:
            return []
        return ["CERTIFICATIONS", *(f"• {c}" for c in kept_certs), ""]

    emitters = {
        "summary": summary_block,
        "experience": experience_block,
        "projects": projects_block,
        "skills_line": skills_block,
        "education": education_block,
        "certs": certs_block,
    }

    lines: list[str] = []

    contact = cv_structured.get("contact") or {}
    contact_name = str(contact.get("name") or "").strip()
    contact_title = str(contact.get("title") or "").strip()
    contact_line = " · ".join(
        str(contact.get(key) or "").strip()
        for key in ("location", "email", "phone", "linkedin")
        if str(contact.get(key) or "").strip()
    )
    if contact_name:
        lines.append(contact_name)
    if contact_title:
        lines.append(contact_title)
    if contact_line:
        lines.append(contact_line)
    if contact_name or contact_title or contact_line:
        lines.append("")

    for key in normalize_section_order(section_order):
        lines.extend(emitters[key]())

    rendered = "\n".join(lines).rstrip()
    carried = unknown_sections(carry_unknown_from)
    if carried:
        rendered = f"{rendered}\n\n{carried}"
    return rendered + "\n"
