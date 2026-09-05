"""Git + gh caller for a Notice close. Never git add -A. Branch from origin/main."""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from collections.abc import Callable
from pathlib import Path

_logger = logging.getLogger("app.notice")


class GitHubMerger:
    def __init__(self, repo: Path, run_tests: Callable[[Path, list[str]], bool] | None = None) -> None:
        self._repo = repo
        self._run_tests = run_tests

    def merge_to_main(self, files: dict[str, str], *, message: str) -> str | None:
        if not files:
            return None
        fetch = _run(["git", "fetch", "origin", "main"], cwd=self._repo)
        if fetch != 0:
            _logger.warning("metric notice.git_fetch_failed")
            return None
        branch = "notice/" + _slug(next(iter(files.keys())))
        work = Path(tempfile.mkdtemp(prefix="notice-close-"))
        add = _run(
            ["git", "worktree", "add", "-B", branch, str(work), "origin/main"],
            cwd=self._repo,
        )
        if add != 0:
            return None
        try:
            for rel, content in files.items():
                dest = work / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(content, encoding="utf-8")
            if self._run_tests is not None and not self._run_tests(work, list(files)):
                _logger.warning("metric notice.author_tests_failed")
                return None
            add_files = _run(["git", "add", "--", *files.keys()], cwd=work)
            if add_files != 0:
                return None
            commit = _run(["git", "commit", "-m", message], cwd=work)
            if commit != 0:
                return None
            if _run(["git", "push", "-u", "origin", branch], cwd=work) != 0:
                return None
            title = message.split("\n", 1)[0][:70]
            if _run(
                [
                    "gh",
                    "pr",
                    "create",
                    "--base",
                    "main",
                    "--head",
                    branch,
                    "--title",
                    title,
                    "--body",
                    "Notice close (CONTEXT.md). Root-cause fix; this Notice's files only.",
                ],
                cwd=work,
            ) != 0:
                return None
            if _run(["gh", "pr", "merge", "--squash", "--delete-branch"], cwd=work) != 0:
                _logger.warning("metric notice.pr_merge_failed branch=%s", branch)
                return None
            sha = _output(["git", "rev-parse", "origin/main"], cwd=self._repo)
            _run(["git", "fetch", "origin", "main"], cwd=self._repo)
            sha = _output(["git", "rev-parse", "origin/main"], cwd=self._repo)
            return sha or None
        finally:
            _run(["git", "worktree", "remove", "--force", str(work)], cwd=self._repo)

    @staticmethod
    def available() -> bool:
        if os.environ.get("NOTICE_GIT", "1").strip() == "0":
            return False
        return bool(os.environ.get("GITHUB_TOKEN", "").strip()) or bool(
            os.environ.get("GH_TOKEN", "").strip()
        )


def head_sha(repo: Path) -> str:
    return _output(["git", "rev-parse", "HEAD"], cwd=repo)


def on_main(repo: Path) -> bool:
    ref = os.environ.get("GITHUB_REF", "")
    if ref == "refs/heads/main":
        return True
    branch = _output(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo)
    return branch == "main"


def _slug(path: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in path)[:40].strip("-") or "close"


def _run(cmd: list[str], *, cwd: Path) -> int:
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        _logger.warning(
            "metric notice.git_cmd_failed cmd=%s code=%s err=%s",
            cmd[0],
            result.returncode,
            (result.stderr or "")[:200],
        )
    return result.returncode


def _output(cmd: list[str], cwd: Path) -> str:
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return ""
    return result.stdout.strip()
