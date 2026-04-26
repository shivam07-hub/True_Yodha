"""
Quality Gate for AI-polished CV output. Enforces the Honesty Principle —
the polished text must not exceed the user's actual capability.

Rejection reasons:
  banned_phrase            — buzzword denylist hit
  markdown_output          — model returned markdown headings or fenced code
  too_long                 — output > 1.25× baseline word count
  invented_metric          — numeric tokens not present in any source input
  removed_factual_content  — < 70% of baseline tokens retained
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class QualityGateResult:
    accepted: bool
    reason: str | None = None


def _word_count(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))


def polish_output_passes_quality_gates(
    output: str,
    baseline_text: str,
    inputs: dict[str, Any],
) -> QualityGateResult:
    lowered = output.lower()
    banned = ["world-class", "rockstar", "ninja", "guru", "synergy", "leveraged cutting-edge"]
    if any(phrase in lowered for phrase in banned):
        return QualityGateResult(False, "banned_phrase")
    if "```" in output or re.search(r"^#{1,6}\s", output, flags=re.MULTILINE):
        return QualityGateResult(False, "markdown_output")
    baseline_words = max(1, _word_count(baseline_text))
    if _word_count(output) > baseline_words * 1.25:
        return QualityGateResult(False, "too_long")

    allowed_text = "\n".join(
        [
            str(inputs.get("baseline_text") or ""),
            str(inputs.get("job_description") or ""),
            " ".join(inputs.get("target_skills") or []),
            " ".join(inputs.get("proof_texts") or []),
        ]
    ).lower()
    metrics = re.findall(r"\b\d+(?:\.\d+)?%?\b", output)
    for metric in metrics:
        if metric.lower() not in allowed_text:
            return QualityGateResult(False, "invented_metric")
    baseline_tokens = {token for token in re.findall(r"\b[a-zA-Z][a-zA-Z0-9+#.-]{3,}\b", baseline_text.lower())}
    if baseline_tokens:
        output_tokens = set(re.findall(r"\b[a-zA-Z][a-zA-Z0-9+#.-]{3,}\b", lowered))
        retained_ratio = len(baseline_tokens & output_tokens) / len(baseline_tokens)
        if retained_ratio < 0.7:
            return QualityGateResult(False, "removed_factual_content")
    return QualityGateResult(True)
