import subprocess
from pathlib import Path

from myro_ops.context import OpsContext
from myro_ops.models import ToolResult


def _run_git(repo_root: Path, args: list[str]) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=repo_root,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return completed.stdout.strip()


def parse_commit_log(output: str) -> list[str]:
    return [line.strip() for line in output.splitlines() if line.strip()]


def collect_recent_migrations(repo_root: Path, *, limit: int = 5) -> list[str]:
    migration_dir = repo_root / "database" / "migrations"
    if not migration_dir.exists():
        return []
    names = sorted((path.name for path in migration_dir.glob("*.sql")), reverse=True)
    return [f"database/migrations/{name}" for name in names[:limit]]


def get_release_digest(context: OpsContext) -> ToolResult:
    details: list[str] = []
    evidence = ["git log --oneline -8", "database/migrations/*.sql", ".github/workflows"]
    recommendations: list[str] = []
    status = "ready"

    try:
        commits = parse_commit_log(_run_git(context.repo_root, ["log", "--oneline", "-8"]))
    except subprocess.CalledProcessError as exc:
        return ToolResult(
            name="release",
            status="blocked",
            summary="Recent commits could not be read.",
            details=[exc.stderr.strip() or exc.__class__.__name__],
            evidence=evidence,
            recommendations=["Run from inside the Myro repository."],
        )

    details.append("Recent commits:")
    details.extend(commits or ["No commits found."])

    migrations = collect_recent_migrations(context.repo_root)
    details.append("Recent migrations:")
    details.extend(migrations or ["No migrations directory found."])

    workflow_dir = context.repo_root / ".github" / "workflows"
    workflows = sorted(path.name for path in workflow_dir.glob("*.yml")) if workflow_dir.exists() else []
    details.append("CI workflows:")
    details.extend(workflows or ["No workflow files found."])
    if not workflows:
        status = "degraded"
        recommendations.append("Add or restore CI workflow coverage.")

    if any("migration" in commit.lower() for commit in commits):
        recommendations.append("Confirm database migrations have been applied before production deploy.")

    return ToolResult(
        name="release",
        status=status,
        summary="Release state summarized from git, migrations, and CI workflows.",
        details=details,
        evidence=evidence,
        recommendations=recommendations or ["Review latest commits before deploy handoff."],
    )
