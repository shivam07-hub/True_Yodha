"""
Shared content loading for the job_path package. Reads the JSON / Markdown
authoring assets from app/content/job_path/.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

CONTENT_DIR = Path(__file__).resolve().parents[2] / "content" / "job_path"


def _load_json(name: str) -> dict[str, Any]:
    with open(CONTENT_DIR / name, encoding="utf-8") as handle:
        return json.load(handle)


def _load_text(name: str) -> str:
    with open(CONTENT_DIR / name, encoding="utf-8") as handle:
        return handle.read()


def content_bundle() -> dict[str, Any]:
    return {
        "milestone_templates": _load_json("milestone_templates.json"),
        "readiness_tiers": _load_json("readiness_tiers.json"),
        "cv_confidence_labels": _load_json("cv_confidence_labels.json"),
        "follow_up_playbooks": _load_json("follow_up_playbooks.json"),
        "job_card_copy": _load_json("job_card_copy.json"),
        "ai_polish_prompt": _load_text("ai_polish_prompt.md"),
    }
