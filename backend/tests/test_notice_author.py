"""Notice class-2 author — JSON files only, never git add -A, merge is a caller."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.notice.author import parse_files, pick_open_500, try_close_one
from app.notice.types import NoticeRecord


class _Complete:
    def __init__(self, payload: str) -> None:
        self.payload = payload

    def complete(self, prompt: str) -> str:
        assert "unhandled_500" in prompt
        return self.payload


class _Merger:
    def __init__(self) -> None:
        self.files: dict[str, str] | None = None

    def merge_to_main(self, files: dict[str, str], *, message: str) -> str | None:
        self.files = files
        assert "fix(notice):" in message
        return "deadbeef"


def test_parse_files_rejects_paths_outside_backend() -> None:
    with pytest.raises(ValueError):
        parse_files(json.dumps({"files": [{"path": "frontend/secret.ts", "content": "x"}]}))
    with pytest.raises(ValueError):
        parse_files(json.dumps({"files": [{"path": "backend/app/../.env", "content": "x"}]}))


def test_parse_files_strips_fences() -> None:
    files = parse_files(
        "```json\n"
        + json.dumps({"files": [{"path": "backend/app/foo.py", "content": "ok\n"}]})
        + "\n```"
    )
    assert files == {"backend/app/foo.py": "ok\n"}


def test_try_close_one_merges_named_cause(tmp_path: Path) -> None:
    source = tmp_path / "backend" / "app" / "boom.py"
    source.parent.mkdir(parents=True)
    source.write_text("def boom() -> None:\n    raise RuntimeError('x')\n", encoding="utf-8")
    row = NoticeRecord(
        cause_key="unhandled_500:RuntimeError:app/boom.py:boom",
        cause_class="unhandled_500",
        status="open",
        occurrence_count=1,
        first_seen_at=datetime(2026, 9, 6, tzinfo=timezone.utc),
        last_seen_at=datetime(2026, 9, 6, tzinfo=timezone.utc),
        last_method="GET",
        last_path="/x",
        last_correlation_id="c",
        closing_commit=None,
        blocked_reason=None,
        proof_test=None,
    )
    merger = _Merger()
    payload = json.dumps(
        {"files": [{"path": "backend/app/boom.py", "content": "def boom() -> None:\n    return None\n"}]}
    )
    proof = try_close_one(
        row,
        repo=tmp_path,
        complete=_Complete(payload),
        run_tests=lambda _repo, _files: True,
        merger=merger,
    )
    assert proof is not None
    assert proof.on_main is True
    assert proof.sha == "deadbeef"
    assert proof.cause_key == row.cause_key
    assert merger.files is not None
    assert any(path.startswith("backend/tests/test_notice_close_") for path in merger.files)
    assert pick_open_500((row,)) is row
