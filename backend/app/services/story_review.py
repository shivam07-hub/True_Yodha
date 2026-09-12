"""story_review — the Stories review space payload, assembled once.

What the user is asked, what Myro already did, and what they have ruled on, in
one shape: the questions waiting (same achievement? same role?), the folds
Myro made on its own (each undoable), and the count they have decided.

Pure: rows in, payload out. `story_identity` owns the rules and the effects;
this only decides what is worth showing.

A question about something that has changed since is not asked: a pair whose
story or role has been archived in the meantime is dropped, and a fold whose
survivor or duplicate no longer looks folded is not offered for undo.
"""
from __future__ import annotations

from typing import Any


def role_label(role: dict[str, Any]) -> str:
    company = str(role.get("company") or "").strip()
    title = str(role.get("title") or "").strip()
    return " — ".join(p for p in (company, title) if p)


def _story_card(
    story: dict[str, Any], roles: dict[str, dict[str, Any]], pointers: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    pts = pointers.get(str(story["id"]), [])
    canonical = next((p for p in pts if p.get("is_canonical")), pts[0] if pts else None)
    role = roles.get(str(story.get("role_id") or ""))
    return {
        "id": str(story["id"]),
        "title": str(story.get("title") or ""),
        "role_label": role_label(role) if role else "",
        "pointer": str((canonical or {}).get("text") or ""),
        "variant_count": len(pts),
    }


def build_review(
    *,
    proposals: list[dict[str, Any]],
    role_proposals: list[dict[str, Any]],
    folds: list[dict[str, Any]],
    stories: list[dict[str, Any]],
    roles: list[dict[str, Any]],
    pointers: list[dict[str, Any]],
    user_ruled: int,
) -> dict[str, Any]:
    by_id = {str(s["id"]): s for s in stories}
    roles_by_id = {str(r["id"]): r for r in roles}
    active_roles = {rid for rid, r in roles_by_id.items() if (r.get("status") or "active") == "active"}
    by_story: dict[str, list[dict[str, Any]]] = {}
    for p in pointers:
        by_story.setdefault(str(p.get("story_id")), []).append(p)

    def active(sid: str) -> bool:
        story = by_id.get(sid)
        return bool(story) and (story.get("status") or "active") == "active"

    story_pairs = []
    for row in proposals:
        a, b = str(row["story_a"]), str(row["story_b"])
        if not (active(a) and active(b)):
            continue  # curated away since — the question is void
        story_pairs.append({
            "story_a": a, "story_b": b,
            "a": _story_card(by_id[a], roles_by_id, by_story),
            "b": _story_card(by_id[b], roles_by_id, by_story),
        })

    role_pairs = [
        {
            "role_a": str(row["role_a"]), "role_b": str(row["role_b"]),
            "a_label": role_label(roles_by_id[str(row["role_a"])]),
            "b_label": role_label(roles_by_id[str(row["role_b"])]),
        }
        for row in role_proposals
        if str(row["role_a"]) in active_roles and str(row["role_b"]) in active_roles
    ]

    merged_for_you = []
    for row in folds:
        keep_id = str(row.get("keep_id") or "")
        dup_id = str((row.get("moved") or {}).get("dup_id") or "")
        keep, dup = by_id.get(keep_id), by_id.get(dup_id)
        if not keep or not dup:
            continue
        # Only still-folded pairs can be undone.
        if (keep.get("status") or "active") != "active" or (dup.get("status") or "active") != "archived":
            continue
        merged_for_you.append({
            "story_a": str(row["story_a"]), "story_b": str(row["story_b"]),
            "kept": str(keep.get("title") or ""),
            "merged": str(dup.get("title") or ""),
            "when": str(row.get("updated_at") or ""),
        })

    return {
        "story_pairs": story_pairs,
        "role_pairs": role_pairs,
        "merged_for_you": merged_for_you,
        "you_decided": user_ruled,
    }
