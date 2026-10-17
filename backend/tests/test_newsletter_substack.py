"""Newsletter → Substack draft conversion, client, and MCP tools."""

from __future__ import annotations

import json
import struct
import subprocess
import sys
from pathlib import Path

import httpx
import pytest

_SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(_SCRIPTS))

from newsletter_substack.client import (  # noqa: E402
    RefusedPublication,
    SubstackClient,
    SubstackError,
    create_payload,
    publication_origin,
    publish_payload,
)
from newsletter_substack.convert import (  # noqa: E402
    PENDING_CHART_SRC,
    convert_issue,
    text_nodes,
)
from newsletter_substack.issues import load_issue, load_issues  # noqa: E402
from newsletter_substack.mcp_server import (  # noqa: E402
    TOOLS,
    call_tool,
    handle_message,
)
from newsletter_substack.publish import (  # noqa: E402
    PublishRefused,
    confirm_draft,
    intended_requests,
    publish_draft,
    push_issue,
)

FIXTURE = Path(__file__).parent / "fixtures" / "synthetic-hiring-note.mdx"
REPO = Path(__file__).resolve().parents[2]
MCP_SERVER = _SCRIPTS / "newsletter-substack-mcp.py"
CHARTLESS = {
    "2026-05-hiring-map-5-surprises",
    "2026-06-loop-engineering-skill",
    "2026-06-services-supermajority-india",
    "2026-07-devops-to-loop-engineering",
    "2026-07-entry-level-jobs-india",
    "2026-09-finance-city-map-india",
}
NODE_TYPES = {
    "doc",
    "paragraph",
    "heading",
    "bullet_list",
    "ordered_list",
    "list_item",
    "text",
    "captionedImage",
    "image2",
    "caption",
    "horizontal_rule",
}


def _tiny_png() -> bytes:
    return (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\rIHDR"
        + struct.pack(">II", 4, 3)
        + b"\x08\x02\x00\x00\x00"
        + b"\x00" * 8
    )


def _types(node: dict) -> set[str]:
    found = {node["type"]}
    for child in node.get("content") or []:
        found |= _types(child)
    return found


def test_fixture_becomes_editor_nodes_not_markdown() -> None:
    spec = load_issue(FIXTURE, REPO)
    assert spec.slug == "synthetic-hiring-note"
    assert spec.canonical_url == (
        "https://www.himyro.com/newsletter/synthetic-hiring-note"
    )
    blob_text = "\n".join(text_nodes(spec.document))
    assert "##" not in blob_text
    assert "|" not in blob_text
    assert "**" not in blob_text
    assert "<Chart" not in blob_text
    heading = next(
        node for node in spec.document["content"] if node["type"] == "heading"
    )
    assert heading["attrs"]["level"] == 2
    assert text_nodes(heading) == ["A heading"]
    link = next(
        node
        for node in text_nodes(spec.document)
        if node == "https://www.himyro.com/newsletter/synthetic-hiring-note"
        or node == "link"
    )
    assert "https://www.himyro.com/newsletter/synthetic-hiring-note" in text_nodes(
        spec.document
    )
    marks = []

    def walk(node: dict) -> None:
        marks.extend(node.get("marks") or [])
        for child in node.get("content") or []:
            walk(child)

    walk(spec.document)
    assert {"type": "strong"} in marks
    assert {
        "type": "link",
        "attrs": {"href": "https://www.himyro.com/newsletter/synthetic-hiring-note"},
    } in marks
    assert {"type": "em"} in marks
    assert "bullet_list" in _types(spec.document)
    assert "canonical_url" not in spec.document
    assert link


def test_chart_png_is_an_image_node_and_a_missing_png_is_recorded() -> None:
    body = FIXTURE.read_text(encoding="utf-8").split("\n---\n", 1)[1]
    with_chart = convert_issue(
        body,
        slug="synthetic-hiring-note",
        title="Synthetic hiring note",
        subtitle="A short subtitle for the draft.",
        issue_number=99,
        chart_path=Path("/tmp/synthetic-og.png"),
        chart_alt="A synthetic bar chart",
    )
    assert PENDING_CHART_SRC in json.dumps(with_chart.document)
    assert "captionedImage" in _types(with_chart.document)
    assert "Bengaluru" not in text_nodes(with_chart.document)
    assert "|" not in "\n".join(text_nodes(with_chart.document))

    without = convert_issue(
        body,
        slug="synthetic-hiring-note",
        title="Synthetic hiring note",
        subtitle="A short subtitle for the draft.",
        issue_number=99,
        chart_path=None,
        chart_alt=None,
    )
    assert "captionedImage" not in _types(without.document)
    assert PENDING_CHART_SRC not in json.dumps(without.document)
    joined = "\n".join(text_nodes(without.document))
    assert "Bengaluru" in joined
    assert "45%" in joined
    assert "|" not in joined
    assert "Example chart" in joined


def test_synced_issues_are_contiguous_from_one() -> None:
    """A new issue joins the sync set by being the next number. A gap or a
    duplicate is the failure. The ceiling used to be a frozen 22, so issues
    23 and 24 — already in the catalog — failed CI until someone edited the
    snapshot.
    """
    specs = load_issues(REPO)
    numbers = [spec.issue_number for spec in specs]
    assert numbers == list(range(1, numbers[-1] + 1))
    assert numbers[-1] >= 24
    assert all("023" not in spec.slug for spec in specs)
    missing = {spec.slug for spec in specs if spec.chart_path is None}
    assert missing == CHARTLESS
    for spec in specs:
        assert _types(spec.document) <= NODE_TYPES
        for text in text_nodes(spec.document):
            assert "##" not in text, spec.slug
            assert "|" not in text, (spec.slug, text)
            assert not text.lstrip().startswith("#"), spec.slug
        assert spec.canonical_url == f"https://www.himyro.com/newsletter/{spec.slug}"
        if spec.chart_path is None:
            assert "captionedImage" not in _types(spec.document)
        else:
            assert spec.chart_path.suffix == ".png"
            assert spec.chart_path.is_file()
            assert "captionedImage" in _types(spec.document)


def test_mimi_host_is_refused_before_any_request() -> None:
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(500, text="no")

    with pytest.raises(RefusedPublication):
        SubstackClient(
            "https://himyro.substack.com/",
            "super-secret-cookie",
            transport=httpx.MockTransport(handler),
        )
    assert called is False
    with pytest.raises(RefusedPublication) as caught:
        publication_origin("https://HIMYRO.substack.com")
    assert "super-secret-cookie" not in str(caught.value)


def test_error_body_does_not_include_the_cookie() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, text="bad draft")

    client = SubstackClient(
        "https://letters.example.com",
        "super-secret-cookie",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(SubstackError) as caught:
        client.user_id()
    assert "super-secret-cookie" not in str(caught.value)
    assert "400" in str(caught.value)


def test_create_payload_does_not_send_email_or_canonical() -> None:
    payload = create_payload("Title", "Subtitle", 9)
    assert payload["should_send_email"] is False
    assert "canonical_url" not in payload
    assert "send" not in payload
    assert publish_payload() == {"send": False}


def test_publish_refuses_unless_confirm_is_true() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError(request.url)

    client = SubstackClient(
        "https://letters.example.com",
        "sid",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(PublishRefused):
        publish_draft(client, 4, False)
    with pytest.raises(PublishRefused):
        call_tool("publish_draft", {"id": 4, "confirm": False})
    with pytest.raises(ValueError):
        call_tool("publish_draft", {"id": 4, "confirm": True, "send": True})


def test_publish_posts_send_false() -> None:
    seen: list[tuple[str, str, dict | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        seen.append((request.method, str(request.url), body))
        if request.method == "PUT":
            assert body == {"should_send_email": False}
            return httpx.Response(200, json={"id": 4, "should_send_email": False})
        assert body == {"send": False}
        return httpx.Response(
            200,
            json={"id": 4, "is_published": True, "email_sent_at": None},
        )

    client = SubstackClient(
        "https://letters.example.com",
        "sid",
        transport=httpx.MockTransport(handler),
    )
    result = publish_draft(client, 4, True)
    assert result["email_send"] is False
    assert result["email_sent_at"] is None
    assert [call[0] for call in seen] == ["PUT", "POST"]
    assert seen[1][1].endswith("/drafts/4/publish")


def test_push_confirms_body_and_does_not_create_a_second_draft(tmp_path: Path) -> None:
    world = _World()
    png = tmp_path / "chart.png"
    png.write_bytes(_tiny_png())
    spec = convert_issue(
        "Hello.\n\n## Hired\n",
        slug="synthetic-hiring-note",
        title="Synthetic hiring note",
        subtitle="Subtitle",
        issue_number=99,
        chart_path=png,
        chart_alt="Chart",
    )
    client = SubstackClient(
        "https://letters.example.com",
        "sid",
        transport=httpx.MockTransport(world.handler),
    )
    state = tmp_path / "state.json"
    first = push_issue(
        spec,
        dry_run=False,
        publication_url="https://letters.example.com",
        client=client,
        state_path=state,
    )
    second = push_issue(
        spec,
        dry_run=False,
        publication_url="https://letters.example.com",
        client=client,
        state_path=state,
    )
    creates = [
        call
        for call in world.calls
        if call[0] == "POST" and call[1].endswith("/api/v1/drafts")
    ]
    assert len(creates) == 1
    assert first.created is True
    assert second.created is False
    assert first.draft_id == second.draft_id
    assert first.editor_url == "https://letters.example.com/publish/post/5"
    assert first.chart == "uploaded"
    assert "super-secret" not in state.read_text(encoding="utf-8")
    stored = json.loads(state.read_text(encoding="utf-8"))
    assert stored["https://letters.example.com"]["synthetic-hiring-note"]["body_set"] is True


def test_failed_live_call_is_not_retried(tmp_path: Path) -> None:
    world = _World()
    world.fail_put = True
    spec = convert_issue(
        "Hello.\n\n## Hired\n",
        slug="synthetic-hiring-note",
        title="Synthetic hiring note",
        subtitle="Subtitle",
        issue_number=99,
        chart_path=None,
        chart_alt=None,
    )
    client = SubstackClient(
        "https://letters.example.com",
        "sid",
        transport=httpx.MockTransport(world.handler),
    )
    state = tmp_path / "state.json"
    with pytest.raises(SubstackError):
        push_issue(
            spec,
            dry_run=False,
            publication_url="https://letters.example.com",
            client=client,
            state_path=state,
        )
    puts = [call for call in world.calls if call[0] == "PUT"]
    assert len(puts) == 1
    assert json.loads(state.read_text(encoding="utf-8"))[
        "https://letters.example.com"
    ]["synthetic-hiring-note"]["body_set"] is False


def test_dry_run_prints_requests_without_a_cookie() -> None:
    spec = convert_issue(
        "Hello.\n",
        slug="synthetic-hiring-note",
        title="Synthetic hiring note",
        subtitle="Subtitle",
        issue_number=99,
        chart_path=Path("chart.png"),
        chart_alt=None,
    )
    requests = intended_requests(spec, "https://letters.example.com")
    blob = json.dumps(requests)
    assert "Cookie" not in blob
    assert "sid" not in blob.lower()
    assert requests[1]["should_send_email"] is False
    assert any(item["url"].endswith("/image") for item in requests)
    result = push_issue(spec, dry_run=True, publication_url="https://letters.example.com")
    assert result.created is False
    assert result.draft_id is None
    assert result.email_send is False


def test_mcp_tools_are_the_three_draft_tools() -> None:
    names = [tool["name"] for tool in TOOLS]
    assert names == ["push_issue_draft", "get_draft", "publish_draft"]
    publish = TOOLS[2]
    assert publish["inputSchema"]["required"] == ["id", "confirm"]
    assert "send" not in publish["inputSchema"]["properties"]
    listed = handle_message(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
    )
    assert listed is not None
    assert [tool["name"] for tool in listed["result"]["tools"]] == names


def test_mcp_stdio_refuses_publish_without_confirm() -> None:
    messages = [
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "capabilities": {}},
        },
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "publish_draft",
                "arguments": {"id": 8, "confirm": False},
            },
        },
    ]
    payload = "".join(json.dumps(message) + "\n" for message in messages)
    completed = subprocess.run(
        [sys.executable, str(MCP_SERVER)],
        input=payload,
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    lines = [json.loads(line) for line in completed.stdout.splitlines() if line.strip()]
    assert [line["id"] for line in lines] == [1, 2, 3]
    assert lines[2]["result"]["isError"] is True
    assert "confirm=true" in lines[2]["result"]["content"][0]["text"]
    assert "super-secret" not in completed.stdout
    assert "super-secret" not in completed.stderr


def test_read_back_rejects_email_on_and_a_missing_chart() -> None:
    document = convert_issue(
        "Hello.\n\n## Hired\n",
        slug="synthetic-hiring-note",
        title="T",
        subtitle="S",
        issue_number=1,
        chart_path=Path("c.png"),
        chart_alt="Chart",
    ).document
    with pytest.raises(RuntimeError, match="should_send_email"):
        confirm_draft(
            {"draft_body": json.dumps(document), "should_send_email": True},
            document,
            uploaded_src=None,
        )
    with pytest.raises(RuntimeError, match="placeholder"):
        confirm_draft(
            {"draft_body": json.dumps(document), "should_send_email": False},
            document,
            uploaded_src="https://cdn.example/chart.png",
        )


class _World:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict | None]] = []
        self.drafts: dict[int, dict] = {}
        self.fail_put = False
        self.next_id = 4

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        url = str(request.url)
        self.calls.append((request.method, url, body))
        if url.endswith("/user/profile/self"):
            return httpx.Response(200, json={"id": 9})
        if request.method == "POST" and url.endswith("/api/v1/drafts"):
            self.next_id += 1
            draft = {
                "id": self.next_id,
                "draft_body": body["draft_body"],
                "should_send_email": False,
            }
            self.drafts[self.next_id] = draft
            return httpx.Response(200, json={"id": self.next_id, "should_send_email": False})
        if request.method == "POST" and url.endswith("/api/v1/image"):
            assert str(body["image"]).startswith("data:image/png;base64,")
            return httpx.Response(
                200,
                json={
                    "id": 1,
                    "url": "https://substackcdn.com/image/chart.png",
                    "bytes": 20,
                    "imageWidth": 4,
                    "imageHeight": 3,
                },
            )
        if request.method == "PUT":
            if self.fail_put:
                return httpx.Response(400, text="nope")
            draft_id = int(url.rstrip("/").split("/")[-1])
            self.drafts[draft_id].update(body)
            return httpx.Response(200, json=self.drafts[draft_id])
        if request.method == "GET" and "/drafts/" in url:
            draft_id = int(url.rstrip("/").split("/")[-1])
            return httpx.Response(200, json=self.drafts[draft_id])
        return httpx.Response(404, text=url)
