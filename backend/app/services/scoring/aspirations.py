"""Target-role aspiration inference.

Builds {skill_name: target_proficiency} from jobs matching the user's
target roles. Output shape is scoring-flavoured (proficiency targets) which
is why this lives in the scoring package; consumers include the recompute
orchestrator and the jobs gap analysis workflow.
"""

import logging

from app.repositories.scores import RoleFamilyMarket, ScoresRepository
from app.services.scoring.demand_rule import target_level

logger = logging.getLogger(__name__)


def fetch_role_family_market(
    scores_repo: ScoresRepository, target_roles: list[str]
) -> RoleFamilyMarket:
    """What the user's chosen families demand: target proficiency AND weight.

    Both halves come from one read of the Family Profile snapshot, so the level a
    gap is measured against and the weight it is ranked by come from one market.
    The level rule is `demand_rule.target_level` — one written rule, shared with
    the skill-path cards, replacing the two that disagreed.

    Empty when the user has no direction yet or the read fails; callers fall back
    to open-market demand and say so in the copy.
    """
    if not target_roles:
        return RoleFamilyMarket.empty()

    try:
        rows = scores_repo.family_demand_rows(target_roles)
    except Exception as exc:
        logger.error(
            "metric aspiration.role_family_failed families=%r reason=%s fallback_used=true",
            target_roles, exc.__class__.__name__,
        )
        return RoleFamilyMarket.empty()

    aspiration: dict[str, int] = {}
    demand: dict[str, int] = {}
    for row in rows:
        key = str(row.get("taxonomy_key") or "").strip()
        if not key:
            continue
        jobs_with_skill = int(row.get("jobs_with_skill") or 0)
        level = target_level(
            jobs_must_have=int(row.get("jobs_must_have") or 0),
            job_count=int(row.get("job_count") or 0),
            present=jobs_with_skill > 0,
        )
        if level is not None:
            aspiration[key] = level
        demand[key] = int(row.get("weighted_demand") or 0)
    return RoleFamilyMarket(aspiration=aspiration, demand=demand)


def fetch_aspiration_skills(
    scores_repo: ScoresRepository, target_roles: list[str]
) -> dict[str, int]:
    """Target-proficiency half of `fetch_role_family_market`, for callers that
    genuinely only need the targets (role readiness)."""
    return fetch_role_family_market(scores_repo, target_roles).aspiration
