from collections.abc import Callable

from myro_ops.context import OpsContext
from myro_ops.models import ToolResult

ToolFn = Callable[[OpsContext], ToolResult]


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolFn] = {}

    def register(self, command: str, tool: ToolFn) -> None:
        self._tools[command] = tool

    def supported_commands(self) -> list[str]:
        return sorted(self._tools)

    def run(self, command: str, context: OpsContext) -> ToolResult:
        tool = self._tools.get(command)
        if not tool:
            supported = ", ".join(self.supported_commands()) or "none"
            return ToolResult(
                name=command,
                status="blocked",
                summary=f"Unknown command. Supported commands: {supported}",
                recommendations=["Run one of the supported commands."],
            )
        return tool(context)


def route_ask_query(query: str) -> str | None:
    normalized = query.lower()
    if "what changed" in normalized or "release" in normalized or "shipped" in normalized:
        return "release"
    if "what broke" in normalized or "broken" in normalized or "health" in normalized:
        return "health"
    if "users saying" in normalized or "feedback" in normalized or "user pain" in normalized:
        return "feedback"
    if "what should" in normalized or "next" in normalized or "priority" in normalized:
        return "brief"
    return None
