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
    exhausted_roles: list[str] = []
    for role in target_roles:
        try:
            page1 = scores_repo.find_role_skill_rows(role)
        except Exception as exc:
            # `find_role_skill_rows` already retried per _retry_supabase. If we land
            # here, the retries didn't rescue → emit alarm-worthy `exhausted` metric.
            logger.error(
                "metric aspiration.exhausted role=%r reason=%s attempts=3 fallback_used=true",
                role, exc.__class__.__name__,
            )
            exhausted_roles.append(role)
            continue
        all_rows.extend(page1 or [])

    if exhausted_roles and not all_rows:
        # Every target role failed → caller (gap.py) will fall back to market demand.
        logger.warning(
            "metric aspiration.full_fallback roles=%r reason=all_exhausted fallback_used=true",
            exhausted_roles,
        )

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


def role_readiness(
    scores_repo: ScoresRepository,
    skill_level_map: dict[str, int],
    search_roles: list[str],
) -> int | None:
    """0-100 readiness of the user's current skills for ONE target role.

    Readiness = how much of the role's demanded proficiency the user's evidenced
    skills already cover. `search_roles` are the ILIKE keys to gather demand from
    — pass `[title]` plus its taxonomy clusters so a specific human title still
    finds real demand. Returns None when no market demand can be resolved (the UI
    shows "—", never a fake 0). Both maps are keyed by `taxonomy_key`.
    """
    aspiration = fetch_aspiration_skills(scores_repo, search_roles)
    total = sum(aspiration.values())
    if not total:
        return None
    met = sum(min(skill_level_map.get(skill, 0), target) for skill, target in aspiration.items())
    return round(100 * met / total)
