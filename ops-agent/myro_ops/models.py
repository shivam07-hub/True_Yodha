from dataclasses import dataclass, field
from typing import Literal

ToolStatus = Literal["ready", "degraded", "blocked"]


@dataclass(frozen=True)
class ToolResult:
    name: str
    status: ToolStatus
    summary: str
    details: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)


def combine_status(results: list[ToolResult]) -> ToolStatus:
    if any(result.status == "blocked" for result in results):
        return "blocked"
    if any(result.status == "degraded" for result in results):
        return "degraded"
    return "ready"
