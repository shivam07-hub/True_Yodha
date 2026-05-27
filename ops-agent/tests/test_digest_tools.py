from pathlib import Path

from myro_ops.context import OpsContext
from myro_ops.tools.cv_upload_digest import get_cv_upload_digest
from myro_ops.tools.feedback_digest import extract_matching_lines, get_feedback_digest


def _context(tmp_path: Path) -> OpsContext:
    agent_root = tmp_path / "ops-agent"
    agent_root.mkdir()
    return OpsContext(repo_root=tmp_path, agent_root=agent_root, instructions="rules", env={})


def test_extract_matching_lines_keeps_relevant_lines_only() -> None:
    lines = extract_matching_lines(
        "All good\nCV upload was interrupted on Android\nMobile settings overflow",
        keywords=["upload", "mobile"],
    )

    assert lines == ["CV upload was interrupted on Android", "Mobile settings overflow"]


def test_feedback_digest_reads_beta_report(tmp_path: Path) -> None:
    report = tmp_path / "docs" / "beta-testing" / "2026-05-24-first-beta-testing-report.md"
    report.parent.mkdir(parents=True)
    report.write_text("Users praised CV Hub.\nUpload was interrupted.\n", encoding="utf-8")

    result = get_feedback_digest(_context(tmp_path))

    assert result.status == "ready"
    assert "Feedback signals summarized" in result.summary
    assert any("Upload was interrupted" in detail for detail in result.details)


def test_cv_upload_digest_reports_code_paths_and_incident_lines(tmp_path: Path) -> None:
    for path in [
        "backend/app/routers/cv/upload.py",
        "backend/app/services/cv_workflow.py",
        "frontend/lib/api.ts",
    ]:
        target = tmp_path / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("upload", encoding="utf-8")
    agents = tmp_path / "AGENTS.md"
    agents.write_text("CV upload fallback rail shipped after upload interrupted failures.", encoding="utf-8")

    result = get_cv_upload_digest(_context(tmp_path))

    assert result.status == "ready"
    assert any("Present: backend/app/routers/cv/upload.py" in detail for detail in result.details)
    assert any("upload interrupted" in detail.lower() for detail in result.details)
