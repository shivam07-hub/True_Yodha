"""Skills-section refresh — keep the CV SKILLS line current with the living
skill graph, primary-first, never inventing anything.

The problem this closes: the CV ``skills_line`` is captured verbatim at upload
(``cv_parser`` grabs it as-is) and then frozen — every forge level-up, quiz
clear and re-tag grows ``user_skills`` but never flows back into the one box
recruiters + ATS actually scan. So a candidate who has *proven* skills in Myro
still shows the stale upload text.

This module is the PURE half (no DB, no LLM, fully unit-tested). It takes:
  * the current ``skills_line`` text,
  * the user's living skill inventory (``get_user_skill_demand_snapshot`` —
    taxonomy-matched skills with display name, level and market demand), and
  * optionally the target job's skills (to order JD-relevant skills first),
and returns a reviewable proposal: a primary band, a secondary band, the list
of newly-surfaced skills (each with WHY it qualifies), and the rendered
``proposed_skills_line``.

Honesty guards (CVJT1 / no-fabrication):
  * Only skills already in the inventory may be ADDED — and only at
    ``current_level >= 1`` (Myro has real signal: CV-matched or practice-proven).
    Nothing is invented.
  * Existing tokens the user wrote are NEVER dropped — only reordered. A token
    Myro doesn't recognise simply ranks lower; it is not removed.

The router (``routers/cv/skills_refresh``) wires this to the data and the FREE
propose endpoint; the frontend applies the kept line into the living-master
autosave draft (no new baseline write, no charge — this is honesty maintenance,
mirroring the free Rewrite path, not a premium generation).
"""
from __future__ import annotations

import re
from typing import Any

# Cap how many proven-but-missing skills we surface in one proposal — a wall of
# additions reads as noise and dilutes the primary band.
MAX_ADDITIONS = 12
# Without a target job, the primary band is the top in-demand skills; the rest
# fall to secondary. Keeps the lead line scannable in a recruiter's 6 seconds.
PRIMARY_CAP = 10

# Split a skills paragraph on the usual separators: comma, semicolon, pipe,
# slash, bullet, newline, and the literal word "and" between skills.
_SPLIT_RE = re.compile(r"[,;|/\n•·]+|\band\b", re.IGNORECASE)
# Drop a trailing parenthetical (e.g. "SQL (Snowflake)" → "SQL") and collapse
# to alphanumerics for MATCHING only — display text is always kept verbatim.
_PAREN_RE = re.compile(r"\([^)]*\)")
_NONALNUM_RE = re.compile(r"[^a-z0-9]+")


def parse_skills_line(skills_line: str | None) -> list[str]:
    """Split a skills paragraph into trimmed tokens, de-duplicated by canonical
    form while preserving first-seen order and original display text."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in _SPLIT_RE.split(skills_line or ""):
        token = raw.strip(" \t.-–—")
        if not token:
            continue
        key = _canon(token)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(token)
    return out


def _canon(text: str) -> str:
    """Canonical match key: lowercase, drop parentheticals, alphanumerics only."""
    lowered = _PAREN_RE.sub(" ", (text or "").lower())
    return _NONALNUM_RE.sub(" ", lowered).strip()


def _represented(name: str, existing_canons: list[str]) -> bool:
    """True when a skill is already on the line — exact canon match, or a
    contained-substring match either direction (guarded to ≥3 chars so short
    tokens like "r" or "go" don't swallow unrelated skills)."""
    target = _canon(name)
    if not target:
        return True  # nothing to add
    for tok in existing_canons:
        if tok == target:
            return True
        if len(target) >= 3 and len(tok) >= 3 and (target in tok or tok in target):
            return True
    return False


def _addition_reason(inv: dict[str, Any], is_jd: bool) -> str:
    """Honest one-line provenance for a surfaced skill. JD relevance leads (most
    actionable), then practice proof, then plain profile presence."""
    level = int(inv.get("current_level") or 0)
    if is_jd:
        return "This job asks for it"
    if level >= 2:
        title = (inv.get("proficiency_title") or "").strip()
        return f"Proven · L{level}" + (f" {title}" if title else "")
    if int(inv.get("weighted_demand") or 0) > 0:
        return "In demand for your roles"
    return "On your Myro profile"


def build_proposal(
    skills_line: str | None,
    inventory: list[dict[str, Any]],
    jd_primary_keys: set[str] | None = None,
    jd_keys: set[str] | None = None,
    focus_skill: str | None = None,
) -> dict[str, Any]:
    """Produce the reviewable skills-section proposal.

    inventory rows: {"skill", "display_name", "current_level",
                     "weighted_demand", "proficiency_title"} — the
    ``get_user_skill_demand_snapshot`` shape.

    Returns: {primary[], secondary[], added[{display_name, reason}],
              proposed_skills_line, changed}.
    """
    jd_primary_keys = {k.lower() for k in (jd_primary_keys or set())}
    jd_keys = {k.lower() for k in (jd_keys or set())} | jd_primary_keys
    jd_present = bool(jd_keys)
    focus_canon = _canon(focus_skill or "")

    existing = parse_skills_line(skills_line)
    existing_canons = [_canon(t) for t in existing]

    # Index the inventory by canonical display name so free-text tokens can be
    # scored, and decide which proven skills are missing from the line.
    inv_by_canon: dict[str, dict[str, Any]] = {}
    for inv in inventory:
        canon = _canon(inv.get("display_name") or inv.get("skill") or "")
        if canon and canon not in inv_by_canon:
            inv_by_canon[canon] = inv

    def _key_of(token: str) -> str | None:
        inv = inv_by_canon.get(_canon(token))
        return (inv.get("skill") or "").lower() if inv else None

    def _is_jd(token: str) -> bool:
        key = _key_of(token)
        return bool(key and key in jd_keys)

    def _rank(token: str) -> tuple[int, int, int, int]:
        inv = inv_by_canon.get(_canon(token))
        key = (inv.get("skill") or "").lower() if inv else None
        return (
            1 if (key and key in jd_primary_keys) else 0,
            1 if (key and key in jd_keys) else 0,
            int(inv.get("weighted_demand") or 0) if inv else 0,
            int(inv.get("current_level") or 0) if inv else 0,
        )

    # Surface proven-but-missing skills, most relevant first. Honesty bar:
    # current_level >= 1 only (Myro has real CV/practice signal).
    added: list[dict[str, str]] = []
    addition_inventory = inventory
    if focus_canon:
        addition_inventory = [
            inv for inv in inventory
            if focus_canon in {
                _canon(inv.get("skill") or ""),
                _canon(inv.get("display_name") or ""),
            }
        ]
    ranked_inv = sorted(
        addition_inventory,
        key=lambda inv: (
            1 if (inv.get("skill") or "").lower() in jd_primary_keys else 0,
            1 if (inv.get("skill") or "").lower() in jd_keys else 0,
            int(inv.get("weighted_demand") or 0),
            int(inv.get("current_level") or 0),
        ),
        reverse=True,
    )
    for inv in ranked_inv:
        if len(added) >= MAX_ADDITIONS:
            break
        if int(inv.get("current_level") or 0) < 1:
            continue
        name = (inv.get("display_name") or inv.get("skill") or "").strip()
        if not name or _represented(name, existing_canons):
            continue
        existing_canons.append(_canon(name))  # so a synonym added once isn't re-added
        added.append({
            "display_name": name,
            "reason": _addition_reason(inv, (inv.get("skill") or "").lower() in jd_keys),
        })

    all_tokens = existing + [a["display_name"] for a in added]
    ranked_tokens = sorted(all_tokens, key=_rank, reverse=True)

    primary: list[str] = []
    secondary: list[str] = []
    for token in ranked_tokens:
        if jd_present:
            (primary if _is_jd(token) else secondary).append(token)
        elif _rank(token)[2] > 0 and len(primary) < PRIMARY_CAP:
            primary.append(token)
        else:
            secondary.append(token)

    proposed_skills_line = ", ".join(primary + secondary)
    changed = _canon(proposed_skills_line) != _canon(skills_line or "") or bool(added)

    return {
        "primary": primary,
        "secondary": secondary,
        "added": added,
        "proposed_skills_line": proposed_skills_line,
        "changed": changed,
    }
