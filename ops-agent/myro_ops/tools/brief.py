from myro_ops.context import OpsContext
from myro_ops.models import ToolResult, combine_status
from myro_ops.tools.backend_health import get_health
from myro_ops.tools.cv_upload_digest import get_cv_upload_digest
from myro_ops.tools.feedback_digest import get_feedback_digest
from myro_ops.tools.release_digest import get_release_digest


def get_brief(context: OpsContext) -> ToolResult:
    results = [
        get_health(context),
        get_release_digest(context),
        get_feedback_digest(context),
        get_cv_upload_digest(context),
    ]
    details: list[str] = []
    evidence: list[str] = []
    recommendations: list[str] = []
    for result in results:
        details.append(f"{result.name}: {result.status} - {result.summary}")
        details.extend(result.details[:8])
        evidence.extend(result.evidence)
        recommendations.extend(result.recommendations)

    return ToolResult(
        name="brief",
        status=combine_status(results),
        summary="Daily ops brief generated from repo health, release, feedback, and CV upload signals.",
        details=details,
        evidence=sorted(set(evidence)),
        recommendations=recommendations[:8] or ["Run health and release checks before the next deploy."],
    )
