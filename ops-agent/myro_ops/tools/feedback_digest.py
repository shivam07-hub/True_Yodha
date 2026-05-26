from pathlib import Path

from myro_ops.context import OpsContext
from myro_ops.models import ToolResult

FEEDBACK_SOURCES = [
    "docs/beta-testing/2026-05-24-first-beta-testing-report.md",
    "docs/session-history/2026-05.md",
    "AGENTS.md",
]

FEEDBACK_KEYWORDS = [
    "feedback",
    "user",
    "upload",
    "mobile",
    "confused",
    "stuck",
    "bug",
    "overflow",
    "score",
    "auth",
    "cv",
]


def extract_matching_lines(text: str, *, keywords: list[str], limit: int = 12) -> list[str]:
    matches: list[str] = []
    lowered_keywords = [keyword.lower() for keyword in keywords]
    for raw_line in text.splitlines():
        line = raw_line.strip(" -\t")
        if not line:
            continue
        lowered = line.lower()
        if any(keyword in lowered for keyword in lowered_keywords):
            matches.append(line)
        if len(matches) >= limit:
            break
    return matches


def _read_source(repo_root: Path, relative_path: str) -> str | None:
    path = repo_root / relative_path
    if not path.exists() or path.name == ".env":
        return None
    return path.read_text(encoding="utf-8", errors="replace")


def get_feedback_digest(context: OpsContext) -> ToolResult:
    details: list[str] = []
    evidence: list[str] = []
    for source in FEEDBACK_SOURCES:
        text = _read_source(context.repo_root, source)
        if text is None:
            continue
        matches = extract_matching_lines(text, keywords=FEEDBACK_KEYWORDS, limit=8)
        evidence.append(source)
        if matches:
            details.append(f"Source: {source}")
            details.extend(matches)

    if not evidence:
        return ToolResult(
            name="feedback",
            status="degraded",
            summary="No local feedback sources were available.",
            details=["Expected beta report, session history, or AGENTS.md."],
            evidence=FEEDBACK_SOURCES,
            recommendations=["Restore local feedback docs or configure future live feedback access."],
        )

    if not details:
        details.append("Feedback sources were present but no high-signal lines matched the v1 keyword set.")

    return ToolResult(
        name="feedback",
        status="ready",
        summary="Feedback signals summarized from local Myro docs.",
        details=details,
        evidence=evidence,
        recommendations=["Use repeated feedback themes to choose the next ops or product fix."],
    )
