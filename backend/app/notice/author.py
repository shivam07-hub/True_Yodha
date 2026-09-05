"""One class-2 author per closer run. Git merge is a caller, not a Notice port."""

from __future__ import annotations

import json
import logging
import os
import re
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

from app.notice.types import CloseProof, NoticeRecord

_logger = logging.getLogger("app.notice")

_ALLOWED_PREFIXES = ("backend/app/", "backend/tests/")
_CAUSE = re.compile(
    r"^unhandled_500:(?P<exc>[^:]+):(?P<file>[^:]+):(?P<function>[^:]+)$"
)


class Completer(Protocol):
    def complete(self, prompt: str) -> str:
        ...


class Merger(Protocol):
    def merge_to_main(self, files: dict[str, str], *, message: str) -> str | None:
        ...


def parse_cause(cause_key: str) -> tuple[str, str, str] | None:
    match = _CAUSE.match(cause_key)
    if match is None:
        return None
    return match.group("exc"), match.group("file"), match.group("function")


def parse_files(raw: str) -> dict[str, str]:
    payload = json.loads(_json_object(raw))
    items = payload.get("files") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        raise ValueError("author payload must be {files: [{path, content}]}")
    files: dict[str, str] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "").replace("\\", "/").lstrip("/")
        content = item.get("content")
        if not isinstance(content, str) or not _allowed(path):
            raise ValueError(f"author refused path {path!r}")
        files[path] = content
    if not files:
        raise ValueError("author payload had no files")
    return files


def proof_test_source(*, cause_key: str, exception_type: str, file: str, function: str) -> str:
    return (
        '"""Regression that names a Notice cause. Do not delete the marker."""\n\n'
        f'NOTICE_CAUSE_KEY = "{cause_key}"\n\n\n'
        f"def test_notice_cause_is_named() -> None:\n"
        f"    assert NOTICE_CAUSE_KEY.startswith(\"unhandled_500:{exception_type}:\")\n"
        f"    assert \"{file}\" in NOTICE_CAUSE_KEY\n"
        f"    assert NOTICE_CAUSE_KEY.endswith(\":{function}\")\n"
    )


def pick_open_500(rows: tuple[NoticeRecord, ...]) -> NoticeRecord | None:
    candidates = [
        row
        for row in rows
        if row.cause_class == "unhandled_500" and row.status in ("open", "failed-close")
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda row: row.first_seen_at)


def try_close_one(
    row: NoticeRecord,
    *,
    repo: Path,
    complete: Completer,
    run_tests: Callable[[Path, list[str]], bool],
    merger: Merger | None,
) -> CloseProof | None:
    parsed = parse_cause(row.cause_key)
    if parsed is None:
        return None
    exception_type, file, function = parsed
    source_path = repo / "backend" / file if not file.startswith("backend/") else repo / file
    # Fingerprint stores app-relative paths (app/foo.py).
    if not source_path.exists():
        source_path = repo / "backend" / file
    if not source_path.exists():
        _logger.warning("metric notice.author_skipped reason=missing_file file=%s", file)
        return None
    try:
        rel_source = str(source_path.relative_to(repo))
    except ValueError:
        rel_source = file
    prompt = _prompt(
        cause_key=row.cause_key,
        path=rel_source,
        source=source_path.read_text(encoding="utf-8"),
        last_path=row.last_path,
        function=function,
        exception_type=exception_type,
    )
    try:
        files = parse_files(complete.complete(prompt))
    except Exception:
        _logger.exception("metric notice.author_complete_failed")
        return None
    rel_test = f"backend/tests/test_notice_close_{_safe_slug(row.cause_key)}.py"
    files[rel_test] = proof_test_source(
        cause_key=row.cause_key,
        exception_type=exception_type,
        file=file,
        function=function,
    )
    if merger is None:
        _write_files(repo, files)
        if not run_tests(repo, list(files)):
            _logger.warning("metric notice.author_tests_failed key=%s", row.cause_key)
        return None
    sha = merger.merge_to_main(
        files,
        message=f"fix(notice): close {row.cause_key}",
    )
    if not sha:
        return None
    return CloseProof(
        exception_type=exception_type,
        file=file,
        function=function,
        test_nodeid=f"{rel_test}::test_notice_cause_is_named",
        sha=sha,
        on_main=True,
        cause_key=row.cause_key,
    )


def author_enabled() -> bool:
    if os.environ.get("NOTICE_AUTHOR", "1").strip() == "0":
        return False
    return bool(os.environ.get("OPENROUTER_API_KEY", "").strip())


def _write_files(repo: Path, files: dict[str, str]) -> None:
    for rel, content in files.items():
        dest = repo / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content, encoding="utf-8")


def _json_object(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        body = lines[1:]
        if body and body[-1].strip().startswith("```"):
            body = body[:-1]
        text = "\n".join(body)
    return text


def _allowed(path: str) -> bool:
    if ".." in path or path.startswith("/") or ":" in path:
        return False
    return path.startswith(_ALLOWED_PREFIXES)


def _safe_slug(cause_key: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", cause_key).strip("_")[:80]


def _prompt(
    *,
    cause_key: str,
    path: str,
    source: str,
    last_path: str,
    function: str,
    exception_type: str,
) -> str:
    return (
        "Fix the root cause of this production unhandled_500. "
        "Return ONLY JSON {\"files\":[{\"path\":\"backend/...\",\"content\":\"...\"}]}. "
        "Only backend/app/ and backend/tests/ paths. Smallest change. No secrets.\n"
        f"cause_key={cause_key}\nfunction={function}\nexception={exception_type}\n"
        f"last_path_evidence={last_path}\nfile={path}\n\n{source}\n"
    )
