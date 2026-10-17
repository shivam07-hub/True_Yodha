"""Stdio MCP for the newsletter → Substack draft pipeline.

Launch from the repo root:

    backend/.venv/bin/python scripts/newsletter-substack-mcp.py

Four tools was the ceiling. ``push_issue_draft`` uploads the chart, so
there is no ``upload_chart`` tool. ``publish_draft`` requires
``confirm=true`` and still posts ``send: false``.
"""

from __future__ import annotations

import json
import sys

from newsletter_substack.client import SubstackClient, as_int
from newsletter_substack.publish import (
    ENV_HELP,
    MissingCredentials,
    PublishRefused,
    credentials_from_env,
    load_env_files,
    project_draft,
    publish_draft,
    push_slug,
)

SERVER_NAME = "newsletter_substack_mcp"
PROTOCOL = "2024-11-05"

TOOLS = [
    {
        "name": "push_issue_draft",
        "description": (
            "Create or update a Substack draft for one synced Myro newsletter "
            "issue. Uploads the issue chart PNG when one exists. Does not "
            "publish and does not email. A second call for the same slug "
            "reuses the recorded draft id. Without SUBSTACK_PUBLICATION_URL "
            "and SUBSTACK_SID this returns a dry run and creates nothing."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "slug": {
                    "type": "string",
                    "description": (
                        "Issue slug, for example "
                        "2026-10-ghost-job-index-mnc-employers."
                    ),
                }
            },
            "required": ["slug"],
            "additionalProperties": False,
        },
        "annotations": {
            "title": "Push issue draft",
            "readOnlyHint": False,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    },
    {
        "name": "get_draft",
        "description": (
            "Read one Substack draft back, including the editor document and "
            "image URLs, so a caller can confirm the body and chart landed. "
            "Does not publish and does not email."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "integer",
                    "description": "Draft id returned by push_issue_draft.",
                }
            },
            "required": ["id"],
            "additionalProperties": False,
        },
        "annotations": {
            "title": "Get draft",
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    },
    {
        "name": "publish_draft",
        "description": (
            "Publish one draft only when confirm is true. Email send is "
            "forced off: the draft is updated with should_send_email false "
            "and the publish body is {send: false}. There is no argument "
            "that turns email on."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "integer",
                    "description": "Draft id returned by push_issue_draft.",
                },
                "confirm": {
                    "type": "boolean",
                    "description": "Must be true. Any other value refuses.",
                },
            },
            "required": ["id", "confirm"],
            "additionalProperties": False,
        },
        "annotations": {
            "title": "Publish draft",
            "readOnlyHint": False,
            "destructiveHint": True,
            "idempotentHint": False,
            "openWorldHint": True,
        },
    },
]


def handle_message(message: dict) -> dict | None:
    if message.get("jsonrpc") != "2.0" or "method" not in message:
        return _rpc_error(message.get("id"), -32600, "invalid JSON-RPC message")
    method = message["method"]
    has_id = "id" in message and message["id"] is not None
    if method == "notifications/initialized":
        return None
    if not has_id:
        return None
    request_id = message["id"]
    if method == "initialize":
        return _ok(
            request_id,
            {
                "protocolVersion": PROTOCOL,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": SERVER_NAME, "version": "1.0.0"},
            },
        )
    if method == "ping":
        return _ok(request_id, {})
    if method == "tools/list":
        return _ok(request_id, {"tools": TOOLS})
    if method == "tools/call":
        params = message.get("params") or {}
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if not isinstance(arguments, dict):
            return _tool_error(request_id, "arguments must be an object")
        try:
            payload = call_tool(name, arguments)
        except Exception as exc:  # MCP tool boundary: report the failure, do not retry.
            return _tool_error(request_id, str(exc))
        return _ok(
            request_id,
            {
                "content": [
                    {"type": "text", "text": json.dumps(payload, indent=2)}
                ],
                "isError": False,
            },
        )
    return _rpc_error(request_id, -32601, f"unknown method: {method}")


def call_tool(name: str, arguments: dict) -> dict:
    if name == "push_issue_draft":
        return _push(arguments)
    if name == "get_draft":
        return _get(arguments)
    if name == "publish_draft":
        return _publish(arguments)
    raise ValueError(f"unknown tool: {name}")


def _push(arguments: dict) -> dict:
    _reject_unknown(arguments, {"slug"})
    slug = arguments.get("slug")
    if not isinstance(slug, str) or not slug.strip():
        raise ValueError("slug must be a non-empty string")
    creds = credentials_from_env()
    if creds is None:
        result = push_slug(slug.strip(), dry_run=True)
        return _public_result(result)
    url, sid = creds
    client = SubstackClient(url, sid)
    try:
        result = push_slug(
            slug.strip(),
            dry_run=False,
            publication_url=url,
            client=client,
        )
    finally:
        client.close()
    return _public_result(result)


def _get(arguments: dict) -> dict:
    _reject_unknown(arguments, {"id"})
    draft_id = _require_int(arguments.get("id"), "id")
    url, sid = _require_creds()
    client = SubstackClient(url, sid)
    try:
        draft = client.get_draft(draft_id)
    finally:
        client.close()
    return project_draft(draft, url)


def _publish(arguments: dict) -> dict:
    _reject_unknown(arguments, {"id", "confirm"})
    if "confirm" not in arguments:
        raise PublishRefused(
            "publish_draft refuses without confirm=true. "
            "Nothing was published and no email was requested."
        )
    confirm = arguments["confirm"]
    if not isinstance(confirm, bool):
        raise PublishRefused(
            "publish_draft refuses unless confirm is boolean true. "
            "Nothing was published and no email was requested."
        )
    draft_id = _require_int(arguments.get("id"), "id")
    if confirm is not True:
        raise PublishRefused(
            "publish_draft refuses without confirm=true. "
            "Nothing was published and no email was requested."
        )
    url, sid = _require_creds()
    client = SubstackClient(url, sid)
    try:
        return publish_draft(client, draft_id, True)
    finally:
        client.close()


def _require_creds() -> tuple[str, str]:
    creds = credentials_from_env()
    if creds is None:
        raise MissingCredentials(ENV_HELP)
    return creds


def _public_result(result: object) -> dict:
    return {
        "slug": result.slug,
        "dry_run": result.dry_run,
        "created": result.created,
        "draft_id": result.draft_id,
        "editor_url": result.editor_url,
        "chart": result.chart,
        "chart_path": result.chart_path,
        "canonical_url": result.canonical_url,
        "email_send": False,
        "requests": result.requests,
    }


def _reject_unknown(arguments: dict, allowed: set[str]) -> None:
    extra = set(arguments) - allowed
    if extra:
        names = ", ".join(sorted(extra))
        raise ValueError(f"unknown arguments: {names}")


def _require_int(value: object, name: str) -> int:
    parsed = as_int(value)
    if parsed is None:
        raise TypeError(f"{name} must be an integer")
    return parsed


def _ok(request_id: object, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _rpc_error(request_id: object, code: int, message: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }


def _tool_error(request_id: object, message: str) -> dict:
    return _ok(
        request_id,
        {
            "content": [{"type": "text", "text": message}],
            "isError": True,
        },
    )


def serve() -> None:
    load_env_files()
    for line in sys.stdin:
        if not line.strip():
            continue
        response = handle_message(json.loads(line))
        if response is None:
            continue
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    serve()
