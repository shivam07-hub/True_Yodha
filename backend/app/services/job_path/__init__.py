"""
job_path package — Application Path, Milestones, CV Variants, Quality Gate.

Split from the monolithic services/job_path.py on 2026-04-27 (Phase 1b-i of
the modularity refactor). Public API re-exported here for back-compat with
routers and tests that import names directly from `app.services.job_path`.
"""

from app.services.job_path._content import CONTENT_DIR, content_bundle
from app.services.job_path.cv_generator import (
    _build_deterministic_cv,
    _completed_milestones,
    _ensure_application_minimal,
    _latest_cv_history,
    _profile_cv_text,
    _snapshot_hash,
    generate_job_cv,
)
from app.services.job_path.llm_polish import (
    AI_POLISH_LIMIT,
    _ai_polish_count,
    _build_polish_messages,
    _call_ai_polish,
    _latest_polished_cv,
    _polish_providers,
    _prompt_section,
)
from app.services.job_path.milestones import (
    _fill_slots,
    _readiness_content,
    _skill_family,
    _tier_for_pct,
    build_rolling_milestones,
    compute_readiness,
    cv_confidence_for_proof_count,
    select_follow_up_playbook,
)
from app.services.job_path.plan import (
    _completed_proof_counts,
    _cv_summary,
    _ensure_application,
    _latest_cv_variant,
    _milestone_response,
    _seed_milestones,
    _target_response,
    _user_skill_levels,
    _validate_targets,
    get_application_path,
    replace_skill_targets,
    update_milestone,
)
from app.services.job_path.quality_gate import (
    QualityGateResult,
    _word_count,
    polish_output_passes_quality_gates,
)

__all__ = [
    "AI_POLISH_LIMIT",
    "CONTENT_DIR",
    "QualityGateResult",
    "build_rolling_milestones",
    "content_bundle",
    "compute_readiness",
    "cv_confidence_for_proof_count",
    "generate_job_cv",
    "get_application_path",
    "polish_output_passes_quality_gates",
    "replace_skill_targets",
    "select_follow_up_playbook",
    "update_milestone",
]
