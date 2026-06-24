"""CV Experience Reservoir (v2) — Phase 1 pure core.

Spec: memory/project_cv_experience_reservoir.md (GRILL-LOCKED 2026-06-24).

The Master CV is reframed from a one-page document into a curatable inventory of
POINTS (atomic achievements). A point = ONE experience/project bullet; it can hold
multiple phrasing-VARIANTS, but exactly one is canonical (the line shown in the
inventory). The role/company/dates CONTAINERS stay as headers inside cv_structured;
the bullets move out into the `cv_points` reservoir, each carrying a `role_anchor`
back to its container.

This module is PURE (no DB, no LLM). Two operations + their invariant:

  • explode_master(cv_structured) -> (headers, point_rows)
        mints a stable `role_id` into each experience/project header, strips the
        bullets out, and emits one migration point-row per bullet.

  • render_master(headers, point_rows) -> cv_structured
        reconstructs the display master by refilling each header's bullets from its
        canonical, active points (ordered).

  INVARIANT (the de-risking guarantee for Phase 1 — "the master always renders as a
  clean CV, identical to before"):

      render_master(*explode_master(cv)) ≡ cv         (on visible content)

  i.e. exploding a master into the reservoir and rendering it back reproduces the
  same summary, skills line, certs, and — per role/project — the same bullets in the
  same order. The only additions are invisible `role_id` metadata on headers; the
  only drop is empty/whitespace-only bullets (already noise, matching the existing
  surfaceable_bullets behaviour).

Phase 1 is SHADOW: nothing reads the reservoir in production yet. Later phases switch
the master view to render from points, append phrasings on gap-accept, etc.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from copy import deepcopy
from typing import Any, Callable

# The two section kinds that become reservoir points. summary / skills_line / certs
# are NOT points (summary is regenerated per JD; skills/certs are atomic lists).
POINT_SECTIONS = ("exp_bullet", "proj_bullet")

# (header list key, section value) for the two container kinds we explode.
_CONTAINERS = (("experience", "exp_bullet"), ("projects", "proj_bullet"))


def _default_id() -> str:
    return str(uuid.uuid4())


def explode_master(
    cv_structured: dict[str, Any],
    new_id: Callable[[], str] = _default_id,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Explode a master cv_structured into (headers, point_rows).

    `headers` is a deep copy of cv_structured with a stable `role_id` minted into
    every experience/project entry and its `bullets` emptied (they now live in the
    reservoir). `point_rows` is one migration row per non-empty bullet, anchored to
    its container's `role_id`, marked canonical+active. `new_id` is injectable so
    tests are deterministic.
    """
    headers = deepcopy(cv_structured)
    points: list[dict[str, Any]] = []

    for list_key, section in _CONTAINERS:
        for container in headers.get(list_key) or []:
            role_id = container.get("role_id") or new_id()
            container["role_id"] = role_id
            kept = 0
            for bullet in container.get("bullets") or []:
                text = (bullet or "").strip()
                if not text:
                    continue
                points.append({
                    "point_key": new_id(),
                    "role_anchor": role_id,
                    "section": section,
                    "text": text,
                    "audience_tags": [],
                    "source": "migration",
                    "is_canonical": True,
                    "ordering": float(kept),
                    "status": "active",
                })
                kept += 1
            container["bullets"] = []

    return headers, points


def _canonical_by_role(point_rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Group active points by role_anchor → one canonical phrasing per point_key,
    ordered. A point with no active-canonical variant renders nothing (the writer
    guarantees one canonical; this read just never invents a second)."""
    # role_anchor -> point_key -> chosen canonical row
    chosen: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for p in point_rows:
        if p.get("status", "active") != "active":
            continue
        if not p.get("is_canonical", True):
            continue
        role = p.get("role_anchor")
        pk = p.get("point_key")
        # First canonical row for a point wins (deterministic; dup-canonical guard).
        chosen[role].setdefault(pk, p)

    out: dict[str, list[dict[str, Any]]] = {}
    for role, by_pk in chosen.items():
        out[role] = sorted(by_pk.values(), key=lambda r: (r.get("ordering", 0.0), r.get("text", "")))
    return out


def render_master(
    headers: dict[str, Any],
    point_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    """Reconstruct the display master: refill each header's bullets from its
    canonical, active points (ordered). Non-point fields (summary, skills_line,
    certs) pass through untouched."""
    cv = deepcopy(headers)
    by_role = _canonical_by_role(point_rows)

    for list_key, _section in _CONTAINERS:
        for container in cv.get(list_key) or []:
            role_id = container.get("role_id")
            container["bullets"] = [p["text"] for p in by_role.get(role_id, [])]

    return cv
