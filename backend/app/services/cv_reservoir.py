"""CV Experience Reservoir (v2) — pure core.

Spec: memory/project_cv_experience_reservoir.md (GRILL-LOCKED 2026-06-24).

The Master CV is reframed from a one-page document into a curatable inventory of
POINTS (atomic achievements). A point = ONE experience/project bullet; it can hold
multiple phrasing-VARIANTS, but exactly one is canonical (the line shown in the
inventory). The role/company/dates CONTAINERS stay as headers inside cv_structured;
the bullets are mirrored out into the `cv_points` reservoir, each carrying a
`role_anchor` back to its container.

This module is PURE (no DB, no LLM). Two operations + their invariant:

  • explode_master(cv_structured) -> point_rows
        one row per non-empty experience/project bullet, anchored to its container.

  • render_master(cv_structured, point_rows) -> cv_structured
        the display master: each container's bullets refilled from its canonical,
        active points (ordered). Non-bullet fields pass through untouched.

  INVARIANT (the de-risking guarantee — "the master always renders as a clean CV,
  identical to before"):

      render_master(cv, explode_master(cv)) == cv      (clean bullets in → identity)

  i.e. mirroring a master into the reservoir and rendering it back reproduces the
  same CV. (Empty/whitespace-only bullets are dropped — already noise, matching the
  existing surfaceable_bullets behaviour.)

`role_anchor` is POSITIONAL (`"{list_key}:{index}"`, e.g. "experience:0"). This keeps
Phase-1 a pure, additive, REVERSIBLE shadow: the backfill inserts cv_points rows and
NEVER mutates the live master (no minted ids, no stripped bullets). Reorder-safety of
the anchor is a Phase-N concern (when the master view actually switches to render from
points and stable role ids get reconciled in); until then nothing reads the reservoir.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from copy import deepcopy
from typing import Any, Callable

# The two section kinds that become reservoir points. summary / skills_line / certs
# are NOT points (summary is regenerated per JD; skills/certs are atomic lists).
POINT_SECTIONS = ("exp_bullet", "proj_bullet")

# (cv_structured list key, section value) for the two container kinds we mirror.
_CONTAINERS = (("experience", "exp_bullet"), ("projects", "proj_bullet"))


def _default_id() -> str:
    return str(uuid.uuid4())


def role_anchor(list_key: str, item_index: int) -> str:
    """Positional anchor tying a point to its container (experience[i] / projects[i])."""
    return f"{list_key}:{item_index}"


def explode_master(
    cv_structured: dict[str, Any],
    new_id: Callable[[], str] = _default_id,
) -> list[dict[str, Any]]:
    """Mirror a master cv_structured into reservoir point rows — one migration row per
    non-empty experience/project bullet, anchored to its container, marked
    canonical+active. Does NOT mutate cv_structured. `new_id` is injectable so tests
    are deterministic."""
    points: list[dict[str, Any]] = []
    for list_key, section in _CONTAINERS:
        for i, container in enumerate(cv_structured.get(list_key) or []):
            anchor = role_anchor(list_key, i)
            kept = 0
            for bullet in container.get("bullets") or []:
                text = (bullet or "").strip()
                if not text:
                    continue
                points.append({
                    "point_key": new_id(),
                    "role_anchor": anchor,
                    "section": section,
                    "text": text,
                    "audience_tags": [],
                    "source": "migration",
                    "is_canonical": True,
                    "ordering": float(kept),
                    "status": "active",
                })
                kept += 1
    return points


def _canonical_by_anchor(point_rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Group active points by role_anchor → one canonical phrasing per point_key,
    ordered. A point with no active-canonical variant renders nothing (the writer
    guarantees one canonical; this read just never invents a second)."""
    chosen: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)  # anchor -> point_key -> row
    for p in point_rows:
        if p.get("status", "active") != "active":
            continue
        if not p.get("is_canonical", True):
            continue
        # First canonical row for a point wins (deterministic; dup-canonical guard).
        chosen[p.get("role_anchor")].setdefault(p.get("point_key"), p)

    out: dict[str, list[dict[str, Any]]] = {}
    for anchor, by_pk in chosen.items():
        out[anchor] = sorted(by_pk.values(), key=lambda r: (r.get("ordering", 0.0), r.get("text", "")))
    return out


def render_master(
    cv_structured: dict[str, Any],
    point_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    """Reconstruct the display master: refill each container's bullets from its
    canonical, active points (ordered). Non-bullet fields pass through untouched."""
    cv = deepcopy(cv_structured)
    by_anchor = _canonical_by_anchor(point_rows)
    for list_key, _section in _CONTAINERS:
        for i, container in enumerate(cv.get(list_key) or []):
            container["bullets"] = [p["text"] for p in by_anchor.get(role_anchor(list_key, i), [])]
    return cv


# (cv_structured list key, ReservoirView role kind) — experience/project containers.
_ROLE_KINDS = (("experience", "experience"), ("projects", "project"))


def build_reservoir_view(
    cv_structured: dict[str, Any],
    point_rows: list[dict[str, Any]],
    has_metric: Callable[[str], bool],
) -> dict[str, Any]:
    """Group reservoir points into the inventory view: roles (from cv_structured
    headers) → points (by point_key) → phrasing variants (canonical first). A role
    with no points is omitted. `has_metric` (injected to keep this module pure) flags
    a point whose canonical phrasing states no measurable result → needs_impact.

    Pairs with the frontend ReservoirView contract (reservoir-fixture.ts)."""
    by_anchor: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for p in point_rows:
        if p.get("status", "active") == "active":
            by_anchor[p.get("role_anchor")].append(p)

    roles: list[dict[str, Any]] = []
    for list_key, kind in _ROLE_KINDS:
        for i, container in enumerate(cv_structured.get(list_key) or []):
            anchor = role_anchor(list_key, i)
            pts = by_anchor.get(anchor)
            if not pts:
                continue

            groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for p in pts:
                groups[p.get("point_key")].append(p)

            points_out: list[dict[str, Any]] = []
            # Points ordered by their canonical line's position within the role.
            ordered_pks = sorted(groups, key=lambda pk: min(v.get("ordering", 0.0) for v in groups[pk]))
            for pk in ordered_pks:
                variants = sorted(
                    groups[pk],
                    key=lambda v: (not v.get("is_canonical", False), v.get("ordering", 0.0)),
                )
                canonical = next((v for v in variants if v.get("is_canonical")), variants[0])
                points_out.append({
                    "point_key": str(pk),
                    "needs_impact": not has_metric(canonical.get("text") or ""),
                    "variants": [{
                        "id": str(v.get("id") or v.get("point_key")),
                        "text": v.get("text") or "",
                        "audience_tags": v.get("audience_tags") or [],
                        "source": v.get("source") or "manual",
                        "is_canonical": bool(v.get("is_canonical")),
                    } for v in variants],
                })

            roles.append({
                "role_id": anchor,
                "kind": kind,
                "title": (container.get("role") if list_key == "experience" else container.get("name")) or "",
                "org": container.get("company") if list_key == "experience" else None,
                "dates": container.get("dates"),
                "points": points_out,
            })

    return {
        "roles": roles,
        "summary": cv_structured.get("summary"),
        "skills_line": cv_structured.get("skills_line"),
        "certs": cv_structured.get("certs") or [],
    }
