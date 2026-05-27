import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from myro_ops.context import OpsContext
from myro_ops.models import ToolResult

DEFAULT_REQUIRED_PATHS = [
    "AGENTS.md",
    "backend/app/main.py",
    "frontend/app/layout.tsx",
    ".github/workflows/backend-ci.yml",
    ".github/workflows/frontend-ci.yml",
]


@dataclass(frozen=True)
class GitStatus:
    branch: str
    ahead: int
    dirty_entries: list[str]

    @property
    def is_dirty(self) -> bool:
        return bool(self.dirty_entries)


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


def parse_git_status(output: str) -> GitStatus:
    lines = [line.rstrip() for line in output.splitlines() if line.strip()]
    header = lines[0] if lines else "## unknown"
    branch = header.removeprefix("## ").split("...")[0].split()[0]
    ahead_match = re.search(r"\[ahead (\d+)", header)
    dirty_entries = [line.strip() for line in lines[1:]]
    return GitStatus(
        branch=branch,
        ahead=int(ahead_match.group(1)) if ahead_match else 0,
        dirty_entries=dirty_entries,
    )


def check_required_paths(repo_root: Path, *, required_paths: list[str] | None = None) -> list[str]:
    paths = required_paths or DEFAULT_REQUIRED_PATHS
    return [path for path in paths if not (repo_root / path).exists()]


def get_repo_status(context: OpsContext) -> ToolResult:
    evidence = ["git status --short --branch", "required repo path check"]
    details: list[str] = []
    recommendations: list[str] = []
    status = "ready"

    try:
        parsed = parse_git_status(_run_git(context.repo_root, ["status", "--short", "--branch"]))
        details.append(f"Branch: {parsed.branch}")
        details.append(f"Commits ahead of upstream: {parsed.ahead}")
        if parsed.is_dirty:
            status = "degraded"
            details.append(f"Dirty worktree entries: {len(parsed.dirty_entries)}")
            details.extend(f"Dirty: {entry}" for entry in parsed.dirty_entries[:12])
            if len(parsed.dirty_entries) > 12:
                details.append(f"Dirty entries omitted: {len(parsed.dirty_entries) - 12}")
            recommendations.append("Separate ops-agent commits from unrelated workspace edits.")
        else:
            details.append("Worktree: clean")
    except subprocess.CalledProcessError as exc:
        return ToolResult(
            name="repo-status",
            status="blocked",
            summary="Git status could not be read.",
            details=[exc.stderr.strip() or exc.__class__.__name__],
            evidence=evidence,
            recommendations=["Run from inside the Myro repository."],
        )

    missing = check_required_paths(context.repo_root)
    if missing:
        status = "blocked"
        details.extend(f"Missing required path: {path}" for path in missing)
        recommendations.append("Restore missing required repo paths before relying on ops reports.")
    else:
        details.append("Required repo paths: present")

    summary = "Repo is ready for local ops checks." if status == "ready" else "Repo has local ops caveats."
    return ToolResult(
        name="repo-status",
        status=status,
        summary=summary,
        details=details,
        evidence=evidence,
        recommendations=recommendations,
    )
