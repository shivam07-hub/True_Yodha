"""Turn one newsletter MDX issue into a Substack ProseMirror document.

Markdown sent as literal text shows ``##`` and table pipes as characters.
Headings, paragraphs, lists, links, and emphasis become editor nodes.
A chart PNG is an image node with a placeholder src; the publisher
replaces that src after upload. This module does not touch the network.

Substack's private draft API returns ``canonical_url`` on a published post
(marcomoauro/substack-mcp, read 2026-10-15) and does not document a write
that points it at an external URL. The body links back to
``https://www.himyro.com/newsletter/{slug}``. This converter does not emit
a ``canonical_url`` field.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

PENDING_CHART_SRC = "pending://chart"
CANONICAL_ORIGIN = "https://www.himyro.com/newsletter"

_STRONG = re.compile(r"\*\*([^*]+)\*\*|__([^_]+)__")
_EM = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")
_CODE = re.compile(r"`([^`]+)`")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
_HEADING = re.compile(r"^(#{1,6})\s+(\S.*)$")
_BULLET = re.compile(r"^[-*]\s+")
_ORDERED = re.compile(r"^\d+\.\s+")
_SEPARATOR_CELL = re.compile(r":?-{3,}:?")
_JSX_ATTR = re.compile(r"(\w+)=\"([^\"]*)\"")


@dataclass(frozen=True)
class DraftSpec:
    slug: str
    title: str
    subtitle: str
    issue_number: int
    canonical_url: str
    chart_path: Path | None
    chart_alt: str | None
    document: dict


def canonical_url(slug: str) -> str:
    return f"{CANONICAL_ORIGIN}/{slug}"


def convert_issue(
    body: str,
    *,
    slug: str,
    title: str,
    subtitle: str,
    issue_number: int,
    chart_path: Path | None,
    chart_alt: str | None,
) -> DraftSpec:
    if not slug or "/" in slug or slug.startswith("."):
        raise ValueError(f"invalid issue slug: {slug!r}")
    document = _document(
        body,
        canonical=canonical_url(slug),
        chart_path=chart_path,
        chart_alt=chart_alt,
    )
    return DraftSpec(
        slug=slug,
        title=title,
        subtitle=subtitle,
        issue_number=issue_number,
        canonical_url=canonical_url(slug),
        chart_path=chart_path,
        chart_alt=chart_alt,
        document=document,
    )


def text_nodes(node: dict) -> list[str]:
    found: list[str] = []

    def walk(current: dict) -> None:
        if current.get("type") == "text":
            found.append(current["text"])
        for child in current.get("content") or []:
            walk(child)

    walk(node)
    return found


def _document(
    body: str,
    *,
    canonical: str,
    chart_path: Path | None,
    chart_alt: str | None,
) -> dict:
    content: list[dict] = [_canonical_paragraph(canonical)]
    placed = False
    for block in _parse_blocks(body):
        if isinstance(block, _Table) or isinstance(block, _ChartEmbed):
            if chart_path is not None and not placed:
                content.append(_image_node(PENDING_CHART_SRC, chart_alt))
                placed = True
                continue
            if isinstance(block, _Table):
                content.append(_table_list(block))
            elif block.title:
                content.append(_paragraph(block.title))
            continue
        content.append(_render_block(block))
    if chart_path is not None and not placed:
        content.insert(1, _image_node(PENDING_CHART_SRC, chart_alt))
    return {"type": "doc", "content": content}


def _canonical_paragraph(url: str) -> dict:
    return {
        "type": "paragraph",
        "content": [
            {"type": "text", "text": "Canonical issue: "},
            {
                "type": "text",
                "text": url,
                "marks": [{"type": "link", "attrs": {"href": url}}],
            },
        ],
    }


def _image_node(src: str, alt: str | None) -> dict:
    attrs: dict = {"src": src, "alt": alt, "imageSize": "normal"}
    content: list[dict] = [{"type": "image2", "attrs": attrs}]
    if alt:
        content.append({"type": "caption", "content": [{"type": "text", "text": alt}]})
    return {"type": "captionedImage", "content": content}


def _render_block(block: _Block) -> dict:
    if isinstance(block, _Heading):
        return {
            "type": "heading",
            "attrs": {"level": block.level},
            "content": _inline(block.text),
        }
    if isinstance(block, _Paragraph):
        return _paragraph(block.text)
    if isinstance(block, _BulletList):
        return _list_node("bullet_list", block.items, ordered=False)
    if isinstance(block, _OrderedList):
        return _list_node("ordered_list", block.items, ordered=True)
    if isinstance(block, _Rule):
        return {"type": "horizontal_rule"}
    if isinstance(block, _Cta):
        return _cta_paragraph(block)
    raise TypeError(f"unrendered block {type(block).__name__}")


def _paragraph(text: str) -> dict:
    return {"type": "paragraph", "content": _inline(text)}


def _list_node(kind: str, items: list[str], *, ordered: bool) -> dict:
    node: dict = {
        "type": kind,
        "content": [
            {
                "type": "list_item",
                "content": [{"type": "paragraph", "content": _inline(item)}],
            }
            for item in items
        ],
    }
    if ordered:
        # `order` is the number the editor renders. `start` is stored beside
        # it and ignored (measured on the live editor, 2026-08-08).
        node["attrs"] = {"order": 1, "start": 1}
    return node


def _table_list(table: _Table) -> dict:
    if not table.rows:
        raise ValueError("newsletter table has no rows")
    header, data = table.rows[0], table.rows[1:]
    if not data:
        data = [header]
        header = []
    items: list[str] = []
    for row in data:
        if header:
            parts = []
            for index, cell in enumerate(row):
                label = header[index] if index < len(header) else ""
                parts.append(f"{label}: {cell}" if label else cell)
            items.append(" · ".join(parts))
        else:
            items.append(" · ".join(row))
    return _list_node("bullet_list", items, ordered=False)


def _cta_paragraph(cta: _Cta) -> dict:
    href = (
        "https://www.himyro.com/cv-preview?role="
        + quote(cta.role)
        + "&utm_source=newsletter&utm_campaign="
        + quote(cta.issue_slug)
    )
    return {
        "type": "paragraph",
        "content": [
            {"type": "text", "text": f"See how you compare as a {cta.role}. "},
            {
                "type": "text",
                "text": "Get my free Myro Score",
                "marks": [{"type": "link", "attrs": {"href": href}}],
            },
        ],
    }


def _inline(text: str, marks: list[dict] | None = None) -> list[dict]:
    active = list(marks or [])
    if text == "":
        if active:
            raise ValueError("empty inline text")
        return []
    match, kind = _earliest(text)
    if match is None:
        node: dict = {"type": "text", "text": text}
        if active:
            node["marks"] = active
        return [node]
    nodes: list[dict] = []
    if match.start() > 0:
        nodes.extend(_inline(text[: match.start()], active))
    if kind == "link":
        nodes.extend(
            _inline(
                match.group(1),
                active + [{"type": "link", "attrs": {"href": match.group(2)}}],
            )
        )
    elif kind == "strong":
        inner = match.group(1) or match.group(2)
        nodes.extend(_inline(inner, active + [{"type": "strong"}]))
    elif kind == "em":
        nodes.extend(_inline(match.group(1), active + [{"type": "em"}]))
    else:
        code: dict = {"type": "text", "text": match.group(1)}
        code["marks"] = active + [{"type": "code"}]
        nodes.append(code)
    if match.end() < len(text):
        nodes.extend(_inline(text[match.end() :], active))
    if not nodes:
        raise ValueError(f"inline markdown produced no text: {text!r}")
    return nodes


def _earliest(text: str) -> tuple[re.Match[str] | None, str | None]:
    found: tuple[re.Match[str] | None, str | None] = (None, None)
    for kind, pattern in (
        ("code", _CODE),
        ("strong", _STRONG),
        ("link", _LINK),
        ("em", _EM),
    ):
        match = pattern.search(text)
        if match is None:
            continue
        if found[0] is None or match.start() < found[0].start():
            found = (match, kind)
    return found


@dataclass(frozen=True)
class _Heading:
    level: int
    text: str


@dataclass(frozen=True)
class _Paragraph:
    text: str


@dataclass(frozen=True)
class _BulletList:
    items: list[str]


@dataclass(frozen=True)
class _OrderedList:
    items: list[str]


@dataclass(frozen=True)
class _Table:
    rows: list[list[str]]


@dataclass(frozen=True)
class _ChartEmbed:
    src: str
    title: str


@dataclass(frozen=True)
class _Cta:
    role: str
    issue_slug: str


@dataclass(frozen=True)
class _Rule:
    pass


_Block = _Heading | _Paragraph | _BulletList | _OrderedList | _Table | _ChartEmbed | _Cta | _Rule


def _parse_blocks(body: str) -> list[_Block]:
    lines = body.replace("\r\n", "\n").split("\n")
    index = 0
    blocks: list[_Block] = []
    while index < len(lines):
        stripped = lines[index].strip()
        if not stripped:
            index += 1
            continue
        if stripped.startswith("<"):
            chunk, index = _consume_jsx(lines, index)
            blocks.append(_jsx_block(chunk))
            continue
        if stripped in ("---", "***"):
            blocks.append(_Rule())
            index += 1
            continue
        heading = _HEADING.match(stripped)
        if heading:
            blocks.append(_Heading(len(heading.group(1)), heading.group(2).strip()))
            index += 1
            continue
        if _BULLET.match(stripped):
            items, index = _consume_list(lines, index, _BULLET)
            blocks.append(_BulletList(items))
            continue
        if _ORDERED.match(stripped):
            items, index = _consume_list(lines, index, _ORDERED)
            blocks.append(_OrderedList(items))
            continue
        if stripped.startswith("|"):
            rows, index = _consume_table(lines, index)
            blocks.append(_Table(rows))
            continue
        parts = [stripped]
        index += 1
        while index < len(lines) and lines[index].strip() and not _block_start(lines[index]):
            parts.append(lines[index].strip())
            index += 1
        blocks.append(_Paragraph(" ".join(parts)))
    return blocks


def _block_start(line: str) -> bool:
    stripped = line.strip()
    if stripped.startswith("<") or stripped.startswith("|"):
        return True
    if stripped in ("---", "***"):
        return True
    if _HEADING.match(stripped) or _BULLET.match(stripped) or _ORDERED.match(stripped):
        return True
    return False


def _consume_list(
    lines: list[str], index: int, pattern: re.Pattern[str]
) -> tuple[list[str], int]:
    items: list[str] = []
    while index < len(lines) and pattern.match(lines[index].strip()):
        item = pattern.sub("", lines[index].strip(), count=1)
        index += 1
        while (
            index < len(lines)
            and lines[index].startswith((" ", "\t"))
            and lines[index].strip()
            and not _block_start(lines[index])
        ):
            item = f"{item} {lines[index].strip()}"
            index += 1
        items.append(item)
    if not items:
        raise ValueError("empty list")
    return items, index


def _consume_table(lines: list[str], index: int) -> tuple[list[list[str]], int]:
    rows: list[list[str]] = []
    while index < len(lines) and lines[index].strip().startswith("|"):
        cells = _split_row(lines[index])
        if not _is_separator(cells):
            rows.append(cells)
        index += 1
    if not rows:
        raise ValueError("table has only a separator row")
    return rows, index


def _split_row(line: str) -> list[str]:
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split("|")]


def _is_separator(cells: list[str]) -> bool:
    return bool(cells) and all(_SEPARATOR_CELL.fullmatch(cell.replace(" ", "")) for cell in cells)


def _consume_jsx(lines: list[str], index: int) -> tuple[str, int]:
    chunk = lines[index].strip()
    index += 1
    while ">" not in chunk:
        if index >= len(lines):
            raise ValueError(f"unclosed JSX tag: {chunk}")
        chunk = f"{chunk} {lines[index].strip()}"
        index += 1
    return chunk, index


def _jsx_block(chunk: str) -> _Block:
    match = re.fullmatch(r"<(\w+)\s*([^<>]*)/?>", chunk.strip())
    if match is None:
        raise ValueError(f"unsupported newsletter markup: {chunk}")
    name, raw_attrs = match.group(1), match.group(2)
    attrs = {key: value for key, value in _JSX_ATTR.findall(raw_attrs)}
    if name == "ChartEmbed":
        if "src" not in attrs or "title" not in attrs:
            raise ValueError(f"ChartEmbed is missing src or title: {chunk}")
        return _ChartEmbed(attrs["src"], attrs["title"])
    if name == "NewsletterCTA":
        if "role" not in attrs or "issueSlug" not in attrs:
            raise ValueError(f"NewsletterCTA is missing role or issueSlug: {chunk}")
        return _Cta(attrs["role"], attrs["issueSlug"])
    raise ValueError(f"unsupported newsletter component: {name}")
