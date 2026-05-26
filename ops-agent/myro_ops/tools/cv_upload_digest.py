from myro_ops.context import OpsContext
from myro_ops.models import ToolResult
from myro_ops.tools.feedback_digest import extract_matching_lines

CV_UPLOAD_CODE_PATHS = [
    "backend/app/routers/cv/upload.py",
    "backend/app/services/cv_workflow.py",
    "frontend/lib/api.ts",
]

CV_UPLOAD_EVIDENCE_PATHS = [
    "database/migrations/20260525e_cv_upload_observability_and_fallback.sql",
]

CV_UPLOAD_SOURCES = [
    "AGENTS.md",
    "docs/beta-testing/2026-05-24-first-beta-testing-report.md",
]

CV_UPLOAD_KEYWORDS = [
    "cv upload",
    "upload interrupted",
    "interrupted",
    "fallback",
    "telemetry",
    "poll",
    "retry",
    "idempotency",
]


def get_cv_upload_digest(context: OpsContext) -> ToolResult:
    details: list[str] = []
    recommendations: list[str] = []
    evidence = [*CV_UPLOAD_CODE_PATHS, *CV_UPLOAD_EVIDENCE_PATHS, *CV_UPLOAD_SOURCES]
    status = "ready"

    for relative_path in CV_UPLOAD_CODE_PATHS:
        if (context.repo_root / relative_path).exists():
            details.append(f"Present: {relative_path}")
        else:
            status = "degraded"
            details.append(f"Missing: {relative_path}")
            recommendations.append(f"Check why {relative_path} is unavailable.")

    for relative_path in CV_UPLOAD_EVIDENCE_PATHS:
        if (context.repo_root / relative_path).exists():
            details.append(f"Evidence present: {relative_path}")
        else:
            details.append(f"Evidence not found locally: {relative_path}")

    incident_lines: list[str] = []
    for source in CV_UPLOAD_SOURCES:
        path = context.repo_root / source
        if not path.exists():
            continue
        incident_lines.extend(
            extract_matching_lines(
                path.read_text(encoding="utf-8", errors="replace"),
                keywords=CV_UPLOAD_KEYWORDS,
                limit=8,
            )
        )

    if incident_lines:
        details.append("Recent local incident memory:")
        details.extend(incident_lines[:10])
    else:
        details.append("No local CV upload incident lines found.")

    return ToolResult(
        name="cv-upload",
        status=status,
        summary="CV upload reliability surface summarized from local code and memory.",
        details=details,
        evidence=evidence,
        recommendations=recommendations or ["Keep fallback rail, telemetry, and idempotency paths visible in ops checks."],
    )
