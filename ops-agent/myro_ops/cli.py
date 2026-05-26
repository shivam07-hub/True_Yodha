import argparse
import sys
from dataclasses import replace
from pathlib import Path
from typing import Sequence

from myro_ops.context import OpsContext, load_context
from myro_ops.models import ToolResult
from myro_ops.report_writer import render_result_markdown, write_daily_report
from myro_ops.tool_registry import ToolRegistry, route_ask_query
from myro_ops.tools.backend_health import get_health
from myro_ops.tools.brief import get_brief
from myro_ops.tools.cv_upload_digest import get_cv_upload_digest
from myro_ops.tools.feedback_digest import get_feedback_digest
from myro_ops.tools.release_digest import get_release_digest


def create_registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register("health", get_health)
    registry.register("feedback", get_feedback_digest)
    registry.register("cv-upload", get_cv_upload_digest)
    registry.register("release", get_release_digest)
    registry.register("brief", get_brief)
    return registry


def _report_root(context: OpsContext) -> Path:
    configured = context.env.get("MYRO_OPS_REPORT_DIR", "").strip()
    if configured:
        path = Path(configured)
        return path if path.is_absolute() else context.repo_root / path
    return context.agent_root / "reports"


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="myro-ops")
    parser.add_argument(
        "command",
        choices=["brief", "health", "feedback", "cv-upload", "release", "ask"],
        help="Ops command to run.",
    )
    parser.add_argument("query", nargs="*", help="Question for the deterministic ask router.")
    return parser.parse_args(list(argv))


def _unsupported_ask(query: str) -> ToolResult:
    return ToolResult(
        name="ask",
        status="blocked",
        summary=f"Unsupported ask query: {query}",
        details=[
            "Supported ask patterns: what changed, what broke, what are users saying, what should we do next.",
        ],
        recommendations=["Run a concrete command such as health, feedback, cv-upload, release, or brief."],
    )


def main(argv: Sequence[str] | None = None, *, context: OpsContext | None = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    runtime_context = context or load_context()
    registry = create_registry()

    command = args.command
    if command == "ask":
        query = " ".join(args.query).strip()
        routed = route_ask_query(query)
        result = registry.run(routed, runtime_context) if routed else _unsupported_ask(query)
    else:
        result = registry.run(command, runtime_context)

    if command == "brief":
        report_path = write_daily_report(result, report_root=_report_root(runtime_context))
        result = replace(result, details=[f"Report written: {report_path}", *result.details])

    print(render_result_markdown(result))
    return 1 if result.status == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
