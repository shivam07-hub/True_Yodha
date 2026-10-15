"""Create one Substack draft per newsletter issue and remember its id.

The state file is local operator state (gitignored). A recorded draft id
is reused, so a second run does not create a second draft. A failed call
is not retried inside the same run.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from newsletter_substack.client import (
    SubstackClient,
    as_int,
    png_size,
    publication_origin,
)
from newsletter_substack.convert import PENDING_CHART_SRC, DraftSpec, text_nodes
from newsletter_substack.issues import issue_by_slug, load_issues

STATE_PATH = Path(__file__).resolve().parents[1] / ".substack-draft-state.json"

ENV_HELP = """\
Live Substack drafts need both of these in backend/.env (or the repo .env):

  SUBSTACK_PUBLICATION_URL=https://<slug>.substack.com
  SUBSTACK_SID=<substack.sid or connect.sid value>

Do not use https://himyro.substack.com. That host is a publication titled
"mimi", not the Myro hiring newsletter.

The website subscribe box reads the same origin, with no cookie, as
NEXT_PUBLIC_SUBSTACK_PUBLICATION_URL in frontend/.env.local. Leave that
empty to keep the current email capture.
"""


class MissingCredentials(RuntimeError):
    pass


class PublishRefused(RuntimeError):
    pass


@dataclass(frozen=True)
class PushResult:
    slug: str
    dry_run: bool
    created: bool
    draft_id: int | None
    editor_url: str | None
    chart: str
    chart_path: str | None
    canonical_url: str
    document: dict
    requests: list[dict]
    email_send: bool = False


def load_env_files(repo: Path | None = None) -> None:
    """Fill empty process env from local env files. Never prints values."""
    root = repo or Path(__file__).resolve().parents[2]
    for path in (root / ".env", root / "backend" / ".env", root / "frontend" / ".env.local"):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            key = key.strip()
            if not key or key in os.environ:
                continue
            os.environ[key] = value.strip().strip('"').strip("'")


def credentials_from_env() -> tuple[str, str] | None:
    url = os.environ.get("SUBSTACK_PUBLICATION_URL", "").strip()
    sid = os.environ.get("SUBSTACK_SID", "").strip()
    if not url and not sid:
        return None
    if not url or not sid:
        present = "SUBSTACK_PUBLICATION_URL" if url else "SUBSTACK_SID"
        missing = "SUBSTACK_SID" if url else "SUBSTACK_PUBLICATION_URL"
        raise MissingCredentials(
            f"{present} is set but {missing} is empty. Live drafts need both.\n\n{ENV_HELP}"
        )
    return url, sid


def credentials_status() -> str:
    """Say whether the two variables are present. Does not return the cookie."""
    url = os.environ.get("SUBSTACK_PUBLICATION_URL", "").strip()
    sid = os.environ.get("SUBSTACK_SID", "").strip()
    url_state = url if url else "unset"
    sid_state = "set" if sid else "unset"
    return f"SUBSTACK_PUBLICATION_URL={url_state} SUBSTACK_SID={sid_state}"


def push_issue(
    spec: DraftSpec,
    *,
    dry_run: bool,
    publication_url: str | None = None,
    client: SubstackClient | None = None,
    state_path: Path | None = None,
) -> PushResult:
    chart = "missing" if spec.chart_path is None else "png"
    chart_path = str(spec.chart_path) if spec.chart_path else None
    if dry_run:
        origin = publication_origin(publication_url) if publication_url else None
        return PushResult(
            slug=spec.slug,
            dry_run=True,
            created=False,
            draft_id=None,
            editor_url=None,
            chart=chart,
            chart_path=chart_path,
            canonical_url=spec.canonical_url,
            document=spec.document,
            requests=intended_requests(spec, origin),
        )
    if client is None or publication_url is None:
        raise MissingCredentials(ENV_HELP)
    origin = publication_origin(publication_url)
    path = state_path or STATE_PATH
    state = _load_state(path)
    bucket = state.setdefault(origin, {})
    if not isinstance(bucket, dict):
        raise RuntimeError(f"state for {origin} is not an object")
    entry = bucket.get(spec.slug)
    if isinstance(entry, dict) and entry.get("body_set") is True:
        return _result_from_entry(spec, entry, created=False)
    if isinstance(entry, dict) and as_int(entry.get("draft_id")) is not None:
        draft_id = entry["draft_id"]
        created = False
    else:
        user_id = client.user_id()
        created_draft = client.create_draft(spec.title, spec.subtitle, user_id)
        draft_id = as_int(created_draft.get("id"))
        if draft_id is None:
            raise RuntimeError(
                f"create draft returned id {created_draft.get('id')!r}. "
                f"Keys: {sorted(created_draft)}"
            )
        entry = {
            "draft_id": draft_id,
            "editor_url": editor_url(origin, draft_id),
            "body_set": False,
            "chart": "pending" if spec.chart_path else "missing",
        }
        bucket[spec.slug] = entry
        _save_state(path, state)
        created = True
    document, uploaded_src, chart_status = _attach_chart(client, draft_id, spec)
    client.update_draft(
        draft_id,
        {"draft_body": json.dumps(document), "should_send_email": False},
    )
    read_back = client.get_draft(draft_id)
    confirm_draft(read_back, document, uploaded_src=uploaded_src)
    entry["body_set"] = True
    entry["chart"] = chart_status
    entry["editor_url"] = editor_url(origin, draft_id)
    bucket[spec.slug] = entry
    _save_state(path, state)
    return PushResult(
        slug=spec.slug,
        dry_run=False,
        created=created,
        draft_id=draft_id,
        editor_url=entry["editor_url"],
        chart=chart_status,
        chart_path=chart_path,
        canonical_url=spec.canonical_url,
        document=document,
        requests=[],
    )


def push_slug(
    slug: str,
    *,
    dry_run: bool,
    publication_url: str | None = None,
    client: SubstackClient | None = None,
    state_path: Path | None = None,
    repo: Path | None = None,
) -> PushResult:
    return push_issue(
        issue_by_slug(slug, repo),
        dry_run=dry_run,
        publication_url=publication_url,
        client=client,
        state_path=state_path,
    )


def push_all(
    *,
    dry_run: bool,
    publication_url: str | None = None,
    client: SubstackClient | None = None,
    state_path: Path | None = None,
    repo: Path | None = None,
) -> list[PushResult]:
    results = []
    for spec in load_issues(repo):
        results.append(
            push_issue(
                spec,
                dry_run=dry_run,
                publication_url=publication_url,
                client=client,
                state_path=state_path,
            )
        )
    return results


def publish_draft(client: SubstackClient, draft_id: int, confirm: bool) -> dict:
    if confirm is not True:
        raise PublishRefused(
            "publish_draft refuses without confirm=true. "
            "Nothing was published and no email was requested."
        )
    if as_int(draft_id) is None:
        raise TypeError("draft id must be an integer")
    client.update_draft(draft_id, {"should_send_email": False})
    result = client.publish(draft_id)
    if result.get("email_sent_at"):
        raise RuntimeError(
            "Substack returned email_sent_at after a publish that forced send off"
        )
    return {
        "status": "published",
        "draft_id": draft_id,
        "editor_url": editor_url(client.publication_url, draft_id),
        "email_send": False,
        "email_sent_at": result.get("email_sent_at"),
        "is_published": result.get("is_published"),
    }


def project_draft(draft: dict, publication_url: str) -> dict:
    body = draft_body(draft)
    draft_id = draft.get("id")
    return {
        "id": draft_id,
        "draft_title": draft.get("draft_title"),
        "draft_subtitle": draft.get("draft_subtitle"),
        "should_send_email": draft.get("should_send_email"),
        "is_published": draft.get("is_published"),
        "email_sent_at": draft.get("email_sent_at"),
        "editor_url": (
            editor_url(publication_origin(publication_url), draft_id)
            if as_int(draft_id) is not None
            else None
        ),
        "body": body,
        "image_srcs": _image_srcs(body),
        "email_send": False,
    }


def editor_url(publication_url: str, draft_id: int) -> str:
    return f"{publication_origin(publication_url)}/publish/post/{draft_id}"


def intended_requests(spec: DraftSpec, publication_url: str | None) -> list[dict]:
    origin = publication_url or "https://<slug>.substack.com"
    requests = [
        {"method": "GET", "url": "https://substack.com/api/v1/user/profile/self"},
        {
            "method": "POST",
            "url": f"{origin}/api/v1/drafts",
            "should_send_email": False,
            "body_keys": [
                "draft_title",
                "draft_subtitle",
                "draft_body",
                "draft_bylines",
                "should_send_email",
            ],
        },
    ]
    if spec.chart_path is not None:
        requests.append(
            {
                "method": "POST",
                "url": f"{origin}/api/v1/image",
                "body_keys": ["image", "postId"],
            }
        )
    requests.append(
        {
            "method": "PUT",
            "url": f"{origin}/api/v1/drafts/{{draft_id}}",
            "should_send_email": False,
            "body_keys": ["draft_body", "should_send_email"],
        }
    )
    requests.append(
        {"method": "GET", "url": f"{origin}/api/v1/drafts/{{draft_id}}"}
    )
    return requests


def draft_body(draft: dict) -> dict:
    if "draft_body" not in draft:
        raise RuntimeError(
            f"draft read-back has no draft_body. Keys: {sorted(draft)}"
        )
    raw = draft["draft_body"]
    if isinstance(raw, str):
        parsed = json.loads(raw)
    elif isinstance(raw, dict):
        parsed = raw
    else:
        raise RuntimeError(f"draft_body is {type(raw).__name__}")
    if parsed.get("type") != "doc":
        raise RuntimeError("draft_body is not a ProseMirror document")
    return parsed


def confirm_draft(draft: dict, document: dict, *, uploaded_src: str | None) -> None:
    if draft.get("should_send_email") is not False:
        raise RuntimeError(
            "draft should_send_email is not false. "
            f"Value: {draft.get('should_send_email')!r}"
        )
    stored = draft_body(draft)
    blob = json.dumps(stored)
    if PENDING_CHART_SRC in blob:
        raise RuntimeError("draft body still contains the chart placeholder")
    for heading in _heading_texts(document):
        if heading not in blob:
            raise RuntimeError(f"draft body is missing heading: {heading}")
    canonical = _canonical_href(document)
    if canonical not in blob:
        raise RuntimeError("draft body is missing the canonical link")
    if uploaded_src is not None and uploaded_src not in blob:
        raise RuntimeError("draft body is missing the uploaded chart url")


def place_chart(document: dict, *, src: str, width: int, height: int, nbytes: int) -> dict:
    found = False

    def walk(node: dict) -> None:
        nonlocal found
        attrs = node.get("attrs")
        if (
            node.get("type") == "image2"
            and isinstance(attrs, dict)
            and attrs.get("src") == PENDING_CHART_SRC
        ):
            attrs["src"] = src
            attrs["width"] = width
            attrs["height"] = height
            attrs["bytes"] = nbytes
            found = True
        for child in node.get("content") or []:
            walk(child)

    cloned = json.loads(json.dumps(document))
    walk(cloned)
    if not found:
        raise RuntimeError("document has no chart placeholder")
    if PENDING_CHART_SRC in json.dumps(cloned):
        raise RuntimeError("chart placeholder survived placement")
    return cloned


def _attach_chart(
    client: SubstackClient, draft_id: int, spec: DraftSpec
) -> tuple[dict, str | None, str]:
    if spec.chart_path is None:
        return spec.document, None, "missing"
    png = spec.chart_path.read_bytes()
    width, height = png_size(png)
    uploaded = client.upload_png(draft_id, png)
    src = uploaded["url"]
    document = place_chart(
        spec.document, src=src, width=width, height=height, nbytes=len(png)
    )
    return document, src, "uploaded"


def _result_from_entry(spec: DraftSpec, entry: dict, *, created: bool) -> PushResult:
    draft_id = as_int(entry.get("draft_id"))
    if draft_id is None:
        raise RuntimeError(f"stored draft id is {entry.get('draft_id')!r}")
    return PushResult(
        slug=spec.slug,
        dry_run=False,
        created=created,
        draft_id=draft_id,
        editor_url=entry.get("editor_url"),
        chart=str(entry.get("chart")),
        chart_path=str(spec.chart_path) if spec.chart_path else None,
        canonical_url=spec.canonical_url,
        document=spec.document,
        requests=[],
    )


def _heading_texts(document: dict) -> list[str]:
    texts: list[str] = []
    for node in document.get("content") or []:
        if node.get("type") == "heading":
            texts.extend(text_nodes(node))
    return texts


def _canonical_href(document: dict) -> str:
    for node in document.get("content") or []:
        for child in node.get("content") or []:
            marks = child.get("marks") or []
            for mark in marks:
                href = (mark.get("attrs") or {}).get("href")
                if (
                    mark.get("type") == "link"
                    and isinstance(href, str)
                    and href.startswith("https://www.himyro.com/newsletter/")
                ):
                    return href
    raise RuntimeError("document has no canonical himyro link")


def _image_srcs(document: dict) -> list[str]:
    found: list[str] = []

    def walk(node: dict) -> None:
        if node.get("type") == "image2":
            src = (node.get("attrs") or {}).get("src")
            if isinstance(src, str):
                found.append(src)
        for child in node.get("content") or []:
            walk(child)

    walk(document)
    return found


def _load_state(path: Path) -> dict:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"{path} is not a JSON object")
    return data


def _save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)
