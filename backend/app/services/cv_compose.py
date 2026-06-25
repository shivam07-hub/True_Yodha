"""Compose CV text from cv_structured + hidden_items + edited_items.

Used by the new per-job CV Builder (Git-commit model). Frontend and backend MUST
agree on item_id derivation — keep both implementations in sync.

item_id scheme (Q10 lock):  stable across re-parse so long as content stays the same.
    {section_type}:{index}:{sha1_first_8_of_content_first_60_chars}
"""

from __future__ import annotations

from typing import Any


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


def collect_item_ids(cv_structured: dict[str, Any]) -> dict[str, str]:
    """Return {item_id: content} for every toggleable item in the structured payload."""
    ids: dict[str, str] = {}

    if cv_structured.get("summary"):
        ids[item_id("summary", 0, cv_structured["summary"])] = cv_structured["summary"]

    for i, exp in enumerate(cv_structured.get("experience") or []):
        for j, bullet in enumerate(exp.get("bullets") or []):
            ids[item_id("exp_bullet", i * 100 + j, bullet)] = bullet

    for i, proj in enumerate(cv_structured.get("projects") or []):
        for j, bullet in enumerate(proj.get("bullets") or []):
            ids[item_id("proj_bullet", i * 100 + j, bullet)] = bullet

    for i, edu in enumerate(cv_structured.get("education") or []):
        id_line = f"{edu.get('institution','')} · {edu.get('degree','')} · {edu.get('dates','')}".strip(" ·")
        display = " · ".join(p for p in (edu.get("institution",""), edu.get("degree",""), edu.get("grade",""), edu.get("dates","")) if p)
        ids[item_id("edu", i, id_line)] = display

    if cv_structured.get("skills_line"):
        ids[item_id("skills_line", 0, cv_structured["skills_line"])] = cv_structured["skills_line"]

    for i, cert in enumerate(cv_structured.get("certs") or []):
        ids[item_id("cert", i, cert)] = cert

    return ids


def render_deterministic(
    cv_structured: dict[str, Any],
    hidden_items: list[str] | None = None,
    edited_items: dict[str, str] | None = None,
) -> str:
    """Render cv_structured into a plain-text CV, skipping hidden items and applying edits."""
    hidden = set(hidden_items or [])
    edits = edited_items or {}

    def keep(iid: str) -> bool:
        return iid not in hidden

    def text_of(iid: str, fallback: str) -> str:
        return edits.get(iid, fallback)

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

    if cv_structured.get("summary"):
        iid = item_id("summary", 0, cv_structured["summary"])
        if keep(iid):
            lines.append("SUMMARY")
            lines.append(text_of(iid, cv_structured["summary"]))
            lines.append("")

    experience = cv_structured.get("experience") or []
    if experience:
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
        if kept_blocks:
            lines.append("EXPERIENCE")
            for block in kept_blocks:
                lines.extend(block)
                lines.append("")

    projects = cv_structured.get("projects") or []
    if projects:
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
        if kept_blocks:
            lines.append("PROJECTS")
            for block in kept_blocks:
                lines.extend(block)
                lines.append("")

    education = cv_structured.get("education") or []
    kept_edu: list[str] = []
    for i, edu in enumerate(education):
        id_line = f"{edu.get('institution','')} · {edu.get('degree','')} · {edu.get('dates','')}".strip(" ·")
        display = " · ".join(p for p in (edu.get("institution",""), edu.get("degree",""), edu.get("grade",""), edu.get("dates","")) if p)
        iid = item_id("edu", i, id_line)
        if keep(iid):
            kept_edu.append(text_of(iid, display))
    if kept_edu:
        lines.append("EDUCATION")
        lines.extend(kept_edu)
        lines.append("")

    if cv_structured.get("skills_line"):
        iid = item_id("skills_line", 0, cv_structured["skills_line"])
        if keep(iid):
            lines.append("SKILLS")
            lines.append(text_of(iid, cv_structured["skills_line"]))
            lines.append("")

    certs = cv_structured.get("certs") or []
    kept_certs: list[str] = []
    for i, cert in enumerate(certs):
        iid = item_id("cert", i, cert)
        if keep(iid):
            kept_certs.append(text_of(iid, cert))
    if kept_certs:
        lines.append("CERTIFICATIONS")
        lines.extend(f"• {c}" for c in kept_certs)
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"
