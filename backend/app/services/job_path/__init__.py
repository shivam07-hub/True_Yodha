"""
job_path package — Application Path, Milestones, Quality Gate.

Per-job CV generation moved to /cv/versions (see backend/app/routers/cv/versions.py
and CONTEXT.md). The legacy generate_job_cv flow was removed in the
cv_versions unification (2026-05-18).
"""

from app.services.job_path._content import CONTENT_DIR, content_bundle
from app.services.job_path.milestones import (
    compute_readiness,
    cv_confidence_for_proof_count,
    select_follow_up_playbook,
)
from app.services.job_path.plan import (
    get_application_path,
    replace_skill_targets,
    update_milestone,
)
from app.services.job_path.quality_gate import (
    QualityGateResult,
    polish_output_passes_quality_gates,
)

__all__ = [
    "CONTENT_DIR",
    "QualityGateResult",
    "content_bundle",
    "compute_readiness",
    "cv_confidence_for_proof_count",
    "get_application_path",
    "polish_output_passes_quality_gates",
    "replace_skill_targets",
    "select_follow_up_playbook",
    "update_milestone",
]
