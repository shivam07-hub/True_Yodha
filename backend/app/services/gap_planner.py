"""Gap-driven rewrite session planner — the honest "Close gaps with Mentor" loop.

Turns a job's skill-gap + the user's CV bullets + practice-proven levels into a
session plan. A gap is one of three things and gets the one honest action:

  • latent  (level 0, evidence IS in a bullet)  → surface: rewrite that host bullet
  • absent  (level 0, no evidence)              → Forge (never fabricate)
  • shallow (level ≥1, below required)          → surface ONE notch (if the user can
                                                   evidence it) + Forge for the rest

Plus the flywheel: when practice has proven a level above what the CV shows
(`skill_assessed_level > matched_level`), offer to surface the CV up to the proven
level — Forge achievement becomes citable evidence.

This module is PURE (no DB, no LLM). The router fetches inputs, runs the LLM
classification (only `level 0` gaps need it), and calls these functions. The
LLM only ever PROPOSES latent/absent; the user confirms in the card before any
rewrite, and the no-fabrication guard in cv_rewrite still governs the rewrite.

Spec: memory/project_gap_driven_rewrite_session.md (GRILL-LOCKED 2026-06-23).
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.services.job_matcher import is_levelled_skill

logger = logging.getLogger(__name__)

# Default count of actionable cards (host-bullet + below-level) the session walks
# in one sitting before "continue" reveals the rest (Q4 — top-5 by priority).
DEFAULT_TOP_N = 5

_CLASSIFY_SYSTEM = (
    "You are a precise CV analyst. For each target skill, decide whether the "
    "candidate's experience bullets already contain genuine EVIDENCE of that skill, "
    "even if the bullet never names it (e.g. 'managed delivery across two teams' is "
    "evidence of 'Sprint Planning'). Verdicts:\n"
    "  • 'latent'  — real evidence is present; cite the single best host bullet index.\n"
    "  • 'absent'  — no genuine evidence in any bullet.\n"
    "NEVER guess 'latent' to be helpful — only on evidence you can point to. When in "
    "doubt, answer 'absent'. Reply ONLY with JSON: "
    '{"classifications":[{"skill":"<key>","verdict":"latent|absent","host_bullet":<index|null>}]}'
)


def build_gap_items(
    job_skills: list[dict[str, Any]],
    user_skill_map: dict[str, int],
) -> list[dict[str, Any]]:
    """Build gap dicts from a job's required skills + the user's level map, sorted
    by priority (missing-primary → below-primary → missing-secondary → below-…).
    Mirrors the canonical sort in routers/cv/detail.py:get_skill_gap; assemble_plan
    relies on this order for top-N selection."""
    items: list[dict[str, Any]] = []
    for skill in job_skills:
        if not is_levelled_skill(skill):
            continue
        key = skill["taxonomy_key"]
        user_level = user_skill_map.get(key.lower()) or 0
        required_level = skill["required_level"]
        items.append({
            "skill": key,
            "is_primary": bool(skill["is_primary"]),
            "user_level": user_level,
            "required_level": required_level,
            "missing": user_level < required_level,
        })
    items.sort(key=lambda g: (
        0 if (g["is_primary"] and g["user_level"] == 0) else
        1 if (g["is_primary"] and g["missing"]) else
        2 if (not g["is_primary"] and g["user_level"] == 0) else
        3 if (not g["is_primary"] and g["missing"]) else 4
    ))
    return items


def build_classify_messages(
    zero_level_skills: list[dict[str, str]],
    bullets: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """Prompt the model to tag each `level 0` gap latent/absent + cite a host bullet."""
    skill_lines = "\n".join(
        f"- {s['skill']}: {s.get('display_name') or s['skill']}" for s in zero_level_skills
    )
    bullet_lines = "\n".join(f"[{i}] {b['text']}" for i, b in enumerate(bullets)) or "(no bullets)"
    user = (
        f"Target skills:\n{skill_lines}\n\n"
        f"Experience bullets (index in brackets):\n{bullet_lines}"
    )
    return [
        {"role": "system", "content": _CLASSIFY_SYSTEM},
        {"role": "user", "content": user},
    ]


def parse_classification(
    raw: str | None,
    valid_skills: set[str],
    n_bullets: int,
) -> dict[str, tuple[str, int | None]]:
    """Defensive parse of the classify reply → {skill: (verdict, host_bullet_index)}.

    Fail-safe to HONEST: anything we can't read cleanly — unparseable JSON, a
    latent verdict with a missing/out-of-range host, an unknown skill — never
    surfaces a skill we can't ground. Unreadable skills default to absent.
    """
    out: dict[str, tuple[str, int | None]] = {}
    data: Any = None
    if raw:
        try:
            data = json.loads(_extract_json(raw))
        except (json.JSONDecodeError, ValueError):
            data = None

    items = (data or {}).get("classifications") if isinstance(data, dict) else None
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            skill = str(item.get("skill") or "").strip()
            if skill not in valid_skills:
                continue
            verdict = str(item.get("verdict") or "").strip().lower()
            host = item.get("host_bullet")
            if verdict == "latent" and isinstance(host, int) and 0 <= host < n_bullets:
                out[skill] = ("latent", host)
            else:
                out[skill] = ("absent", None)

    # Any zero-level skill the model didn't address → honest default: absent.
    for skill in valid_skills:
        out.setdefault(skill, ("absent", None))
    return out


def _extract_json(raw: str) -> str:
    """Pull the first {...} object out of a reply (models sometimes wrap in prose)."""
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    return match.group(0) if match else raw


def _host_dict(bullet: dict[str, Any] | None) -> dict[str, Any] | None:
    """Shape a located host bullet into the card/offer `host` contract (or None)."""
    if not bullet:
        return None
    return {
        "section": bullet["section"],
        "item_index": bullet["item_index"],
        "bullet_index": bullet["bullet_index"],
        "bullet_text": bullet["text"],
    }


def assemble_plan(
    gap_items: list[dict[str, Any]],
    bullets: list[dict[str, Any]],
    classification: dict[str, tuple[str, int | None]],
    assessed_levels: dict[str, int],
    display_names: dict[str, str],
    top_n: int = DEFAULT_TOP_N,
) -> dict[str, Any]:
    """Build the honest session plan. `gap_items` must arrive in priority order
    (missing-primary → below-primary → missing-secondary → below-secondary) — that
    order is preserved verbatim into `order` on every card."""
    host_cards: dict[int, dict[str, Any]] = {}  # host bullet index → card
    below_cards: list[dict[str, Any]] = []
    absent: list[dict[str, Any]] = []
    upgrades: list[dict[str, Any]] = []

    order = 0
    for gap in gap_items:
        if not gap.get("missing"):
            continue
        skill = gap["skill"]
        name = display_names.get(skill, skill)
        current = int(gap.get("user_level") or 0)
        required = int(gap.get("required_level") or 0)

        # The classify pass locates a single host bullet for any missing skill with
        # genuine evidence (latent verdict). Resolve it once — the upgrade offer and
        # the below-level card both surface onto it; no host → practice-only.
        verdict, host = classification.get(skill, ("absent", None))
        host_bullet = bullets[host] if (verdict == "latent" and host is not None) else None

        # Flywheel: practice proved a level the CV doesn't show yet → offer upgrade.
        # Carry the located host so the closing panel can claim it one-tap; without a
        # host (no CV evidence yet) the offer routes to practice to build the proof.
        proven = int(assessed_levels.get(skill, 0) or 0)
        if proven > current:
            upgrades.append({
                "skill": skill, "display_name": name,
                "from_level": current, "to_level": min(proven, required),
                "host": _host_dict(host_bullet),
            })

        if current == 0:
            if verdict == "latent" and host is not None:
                card = host_cards.get(host)
                if card is None:
                    b = bullets[host]
                    card = host_cards[host] = {
                        "order": order,
                        "section": b["section"],
                        "item_index": b["item_index"],
                        "bullet_index": b["bullet_index"],
                        "bullet_text": b["text"],
                        "skills": [],
                    }
                    order += 1
                card["skills"].append({"skill": skill, "display_name": name})
            else:
                absent.append({
                    "skill": skill, "display_name": name,
                    "is_primary": bool(gap.get("is_primary")),
                    "required_level": required,
                })
        else:
            # Shallow: surface ONE notch (capped at required), earn the rest in Forge.
            # The skill is already on the CV, so a host bullet exists — the classify
            # pass locates it so the card can offer the one-notch surface. No host →
            # practice-only (the user earns the level in Forge, flywheel does the rest).
            below_cards.append({
                "order": order,
                "skill": skill, "display_name": name,
                "current_level": current, "required_level": required,
                "surface_to": min(current + 1, required),
                "is_primary": bool(gap.get("is_primary")),
                "host": _host_dict(host_bullet),
            })
            order += 1

    host_list = sorted(host_cards.values(), key=lambda c: c["order"])
    total_actionable = len(host_list) + len(below_cards)
    shown = min(top_n, total_actionable)
    return {
        "host_bullet_cards": host_list,
        "below_level_cards": below_cards,
        "absent_skills": absent,
        "upgrade_offers": upgrades,
        "total_actionable": total_actionable,
        "shown": shown,
        "remaining": max(0, total_actionable - shown),
    }
