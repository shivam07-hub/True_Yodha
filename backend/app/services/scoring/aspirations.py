"""Target-role aspiration inference.

Builds {skill_name: target_proficiency} from jobs matching the user's
target roles. Output shape is scoring-flavoured (proficiency targets) which
is why this lives in the scoring package; consumers include the recompute
orchestrator and the jobs gap analysis workflow.
"""

import logging

from app.repositories.scores import ScoresRepository

logger = logging.getLogger(__name__)


def fetch_aspiration_skills(
    scores_repo: ScoresRepository, target_roles: list[str]
) -> dict[str, int]:
    """{skill_name: target_proficiency} from jobs matching any target role.

    Proficiency targets derived from skill frequency across matching jobs:
      - main_skill appearing in >50% of role jobs → target L4
      - main_skill appearing in >25%              → target L3
      - side_skill (any frequency)                → target L2

    Returns empty dict if no matching jobs found (caller falls back to market demand).
    """
    if not target_roles:
        return {}

    all_rows: list[dict] = []
    for role in target_roles:
        try:
            page1 = scores_repo.find_role_skill_rows(role)
        except Exception as exc:
            logger.warning("Aspiration skill lookup failed for role %r: %s", role, exc)
            continue
        all_rows.extend(page1 or [])

    if not all_rows:
        return {}

    total = len(all_rows)
    main_counts: dict[str, int] = {}
    side_set: set[str] = set()

    for row in all_rows:
        for s in (row.get("main_skills") or []):
            if s and s.strip():
                main_counts[s.strip()] = main_counts.get(s.strip(), 0) + 1
        for s in (row.get("side_skills") or []):
            if s and s.strip():
                side_set.add(s.strip())

    aspiration: dict[str, int] = {}
    for skill, count in main_counts.items():
        freq = count / total
        aspiration[skill] = 4 if freq > 0.5 else 3
    for skill in side_set:
        if skill not in aspiration:
            aspiration[skill] = 2

    return aspiration
