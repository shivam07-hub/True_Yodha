from myro_ops.context import OpsContext
from myro_ops.models import ToolResult
from myro_ops.tool_registry import ToolRegistry, route_ask_query


def _tool(_context: OpsContext) -> ToolResult:
    return ToolResult(
        name="example",
        status="ready",
        summary="Example ran",
    )


def test_registry_runs_registered_tool(tmp_path) -> None:
    context = OpsContext(repo_root=tmp_path, agent_root=tmp_path / "ops-agent", instructions="rules")
    registry = ToolRegistry()
    registry.register("example", _tool)

    result = registry.run("example", context)

    assert result.name == "example"
    assert result.status == "ready"


def test_registry_unknown_command_returns_supported_list(tmp_path) -> None:
    context = OpsContext(repo_root=tmp_path, agent_root=tmp_path / "ops-agent", instructions="rules")
    registry = ToolRegistry()
    registry.register("example", _tool)

    result = registry.run("missing", context)

    assert result.status == "blocked"
    assert "example" in result.summary


def test_route_ask_query_maps_known_patterns() -> None:
    assert route_ask_query("what changed since yesterday?") == "release"
    assert route_ask_query("what broke?") == "health"
    assert route_ask_query("what are users saying?") == "feedback"
    assert route_ask_query("what should we do next?") == "brief"
    assert route_ask_query("who is the CEO?") is None
