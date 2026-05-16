from __future__ import annotations

from datetime import date
from typing import Any


def confidence_label(confidence: float | int | None) -> str:
    if confidence is None:
        return "medium"
    value = float(confidence)
    if value >= 0.8:
        return "high"
    if value >= 0.55:
        return "medium"
    return "needs review"


def normalize_evidence(raw: dict[str, Any]) -> dict[str, Any]:
    milestone_date = raw.get("milestone_date") or raw.get("date")
    if isinstance(milestone_date, date):
        milestone_date = milestone_date.isoformat()
    return {
        "skill": (raw.get("skill") or "General progress").strip(),
        "task": (raw.get("task") or "").strip(),
        "proof": (raw.get("proof") or "").strip(),
        "impact": (raw.get("impact") or "").strip(),
        "date": str(milestone_date or ""),
        "confidence": raw.get("confidence", 0.6),
    }


def build_cv_draft(
    baseline_text: str,
    evidence_items: list[dict[str, Any]],
    version_number: int,
    score_delta: float | None = None,
) -> str:
    """
    Compose an evidence-led CV draft without inventing new claims.

    The baseline CV is preserved verbatim. New material is limited to structured
    milestone evidence supplied by the user.
    """
    normalized = [normalize_evidence(item) for item in evidence_items]
    lines: list[str] = [
        f"CV Draft v{version_number}",
        "",
        "Evidence-led update",
        "This draft preserves your uploaded baseline CV and adds only progress evidence you logged in Myro.",
    ]
    if score_delta is not None:
        sign = "+" if score_delta >= 0 else ""
        lines.append(f"Myro Score movement since last CV: {sign}{score_delta:.1f}")
    lines.extend(["", "New verified progress"])

    for item in normalized:
        parts = [f"- {item['date']}: {item['skill']}"]
        if item["task"]:
            parts.append(f"Task: {item['task']}.")
        if item["proof"]:
            parts.append(f"Proof: {item['proof']}.")
        if item["impact"]:
            parts.append(f"Impact: {item['impact']}.")
        parts.append(f"Confidence: {confidence_label(item['confidence'])}.")
        lines.append(" ".join(parts))

    lines.extend(["", "Baseline CV", baseline_text.strip()])
    return "\n".join(lines).strip() + "\n"
