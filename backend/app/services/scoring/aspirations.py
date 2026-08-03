"""Target-role aspiration inference.

Builds {skill_name: target_proficiency} from jobs matching the user's
target roles. Output shape is scoring-flavoured (proficiency targets) which
is why this lives in the scoring package; consumers include the recompute
orchestrator and the jobs gap analysis workflow.
"""

import logging

from app.repositories.scores import RoleFamilyMarket, ScoresRepository

logger = logging.getLogger(__name__)


def fetch_role_family_market(
    scores_repo: ScoresRepository, target_roles: list[str]
) -> RoleFamilyMarket:
    """What the user's chosen families demand: target proficiency AND weight.

    Proficiency targets derived from skill frequency across matching jobs:
      - main_skill appearing in >50% of role jobs → target L4
      - main_skill appearing in >25%              → target L3
      - side_skill (any frequency)                → target L2

    Weight is the same primary×2 + side×1 count the corpus-wide lookup uses, but
    counted over THIS user's families — so the level a gap is measured against and
    the weight it is ranked by come from one market, not two.

    Empty when the user has no direction yet or the read fails; callers fall back
    to open-market demand and say so in the copy.
    """
    if not target_roles:
        return RoleFamilyMarket.empty()

    try:
        return scores_repo.get_role_family_market(target_roles)
    except Exception as exc:
        logger.error(
            "metric aspiration.role_family_failed families=%r reason=%s fallback_used=true",
            target_roles, exc.__class__.__name__,
        )
        return RoleFamilyMarket.empty()


def fetch_aspiration_skills(
    scores_repo: ScoresRepository, target_roles: list[str]
) -> dict[str, int]:
    """Target-proficiency half of `fetch_role_family_market`, for callers that
    genuinely only need the targets (role readiness)."""
    return fetch_role_family_market(scores_repo, target_roles).aspiration


def role_readiness(
    scores_repo: ScoresRepository,
    skill_level_map: dict[str, int],
    search_roles: list[str],
) -> int | None:
    """0-100 readiness of the user's current skills for ONE target role.

    Readiness = how much of the role's demanded proficiency the user's evidenced
    skills already cover. `search_roles` are canonical role-family keys, never
    job-title substrings. Returns None when no market demand can be resolved (the UI
    shows "—", never a fake 0). Both maps are keyed by `taxonomy_key`.
    """
    aspiration = fetch_aspiration_skills(scores_repo, search_roles)
    total = sum(aspiration.values())
    if not total:
        return None
    met = sum(min(skill_level_map.get(skill, 0), target) for skill, target in aspiration.items())
    return round(100 * met / total)
