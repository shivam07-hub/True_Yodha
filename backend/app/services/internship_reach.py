"""How many people already on Myro a Myro Supported opening would reach.

The recruiter's first result, shown while she writes the post and before she
has an account. Counts only, never people: `hosted_match_count` returns two
integers (everyone who matches, and those of them here in the last 30 days),
and is callable by the service role alone.
"""
from __future__ import annotations

from typing import Any

MAX_SKILLS = 12


def reach(
    db: Any,
    *,
    city: str | None,
    remote: bool,
    skills: list[str],
    kind: str = "internship",
    min_years: int | None = None,
) -> dict[str, int]:
    """A job reaches by its years from; an internship by the student rule.
    Both through `private.hosted_fit`, the rule the seeker's band reads."""
    names = [s.strip() for s in skills if s and s.strip()][:MAX_SKILLS]
    rows = (
        db.rpc(
            "hosted_match_count",
            {
                "p_city": (city or "").strip() or None,
                "p_remote": remote,
                "p_skills": names,
                "p_kind": kind,
                "p_min_years": min_years,
            },
        )
        .execute()
        .data
        or []
    )
    row = rows[0] if rows else {}
    return {"matched": int(row.get("matched") or 0), "active_30d": int(row.get("active_30d") or 0)}
