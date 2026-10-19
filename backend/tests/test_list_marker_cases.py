"""Upload ingest and the CV page's "Fix all" drop the same copied list markers.

Both read `frontend/lib/cv/list-markers.cases.json` — the frontend side is
`tests/list-markers.test.ts`. A case that passes here and fails there means the
page would offer to clean a mark upload keeps, or leave one upload drops.
"""
from __future__ import annotations

import json
from pathlib import Path

from app.services.cv_structured_shape import _without_marker

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "frontend" / "lib" / "cv" / "list-markers.cases.json"


def test_upload_ingest_agrees_with_every_shared_case() -> None:
    cases = json.loads(CASES.read_text(encoding="utf-8"))["cases"]
    assert len(cases) >= 10
    for case in cases:
        assert _without_marker(case["in"]) == case["out"], case
