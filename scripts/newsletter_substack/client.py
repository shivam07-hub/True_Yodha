"""Substack private editor client.

Endpoints match the session-cookie client in marcomoauro/substack-mcp
(read 2026-10-15): drafts live on the publication host under ``/api/v1``,
the signed-in user lives on ``https://substack.com/api/v1``. Creating a
draft and writing its body are separate calls. The image endpoint takes a
PNG data URI and returns a hosted URL; an external URL is stored and does
not render.

``should_send_email`` defaults to true on a real draft. Every write here
sets it false. Publish posts ``{"send": false}`` and has no argument that
turns email on.

No verified write field sets the publication canonical to himyro.com.
Callers link back in the document body instead of sending ``canonical_url``.
"""

from __future__ import annotations

import base64
import json
import struct
from urllib.parse import urlsplit

import httpx

MIMI_HOST = "himyro.substack.com"
PROFILE_URL = "https://substack.com/api/v1/user/profile/self"


class RefusedPublication(RuntimeError):
    """The configured host is not the Myro hiring newsletter."""


class SubstackError(RuntimeError):
    def __init__(self, method: str, url: str, status: int, body: str) -> None:
        self.method = method
        self.url = url
        self.status = status
        self.body = body
        super().__init__(f"Substack {method} {url} -> {status}: {body[:400]}")


def publication_origin(url: str) -> str:
    parsed = urlsplit(url.strip())
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("SUBSTACK_PUBLICATION_URL must be an https origin")
    if parsed.username or parsed.password:
        raise ValueError("SUBSTACK_PUBLICATION_URL must not embed credentials")
    host = parsed.hostname.lower()
    if host == MIMI_HOST:
        raise RefusedPublication(
            "https://himyro.substack.com is a publication titled mimi, "
            "not the Myro hiring newsletter. Set SUBSTACK_PUBLICATION_URL "
            "to the publication that should receive these issues."
        )
    if parsed.path not in ("", "/"):
        raise ValueError("SUBSTACK_PUBLICATION_URL must be the publication origin")
    return f"https://{host}"


def png_size(png: bytes) -> tuple[int, int]:
    if png[:8] != b"\x89PNG\r\n\x1a\n" or png[12:16] != b"IHDR":
        raise ValueError("chart file is not a PNG")
    width, height = struct.unpack(">II", png[16:24])
    if width < 1 or height < 1:
        raise ValueError("chart PNG has no pixels")
    return width, height


def as_int(value: object) -> int | None:
    """JSON booleans are ints. A draft id has to be a real integer."""
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def create_payload(title: str, subtitle: str, user_id: int) -> dict:
    """Empty body on purpose. The editor ignores a body sent at create time."""
    if as_int(user_id) is None:
        raise TypeError("user id must be an integer")
    return {
        "draft_title": title,
        "draft_subtitle": subtitle,
        "draft_body": json.dumps({"type": "doc", "content": [{"type": "paragraph"}]}),
        "draft_bylines": [{"id": user_id, "is_guest": False}],
        "audience": "everyone",
        "write_comment_permissions": "everyone",
        "section_chosen": True,
        "draft_section_id": None,
        "should_send_email": False,
    }


def publish_payload() -> dict:
    return {"send": False}


class SubstackClient:
    def __init__(
        self,
        publication_url: str,
        sid: str,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        if not sid or not sid.strip():
            raise ValueError("SUBSTACK_SID is empty")
        self.publication_url = publication_origin(publication_url)
        self._sid = sid.strip()
        self._http = httpx.Client(transport=transport, timeout=60.0)

    def __repr__(self) -> str:
        return f"SubstackClient(publication_url={self.publication_url!r})"

    def close(self) -> None:
        self._http.close()

    def user_id(self) -> int:
        profile = self._request("GET", PROFILE_URL, json_body=None, referer="/")
        user_id = as_int(profile.get("id"))
        if user_id is None:
            raise RuntimeError(
                f"profile id is {profile.get('id')!r}. Keys: {sorted(profile)}"
            )
        return user_id

    def create_draft(self, title: str, subtitle: str, user_id: int) -> dict:
        return self._request(
            "POST",
            self._url("/drafts"),
            json_body=create_payload(title, subtitle, user_id),
            referer="/publish/post",
        )

    def update_draft(self, draft_id: int, fields: dict) -> dict:
        if "should_send_email" in fields and fields["should_send_email"] is not False:
            raise ValueError("this client only writes should_send_email=false")
        return self._request(
            "PUT",
            self._url(f"/drafts/{draft_id}"),
            json_body=fields,
            referer="/publish/post",
        )

    def upload_png(self, draft_id: int, png: bytes) -> dict:
        png_size(png)
        encoded = base64.b64encode(png).decode("ascii")
        uploaded = self._request(
            "POST",
            self._url("/image"),
            json_body={
                "image": f"data:image/png;base64,{encoded}",
                "postId": draft_id,
            },
            referer="/publish/post",
        )
        url = uploaded.get("url")
        if not isinstance(url, str) or not url.startswith("https://"):
            raise RuntimeError(
                "Substack image upload returned no https url. "
                f"Keys: {sorted(uploaded)}"
            )
        return uploaded

    def get_draft(self, draft_id: int) -> dict:
        draft = self._request(
            "GET",
            self._url(f"/drafts/{draft_id}"),
            json_body=None,
            referer="/publish/post",
        )
        if not isinstance(draft, dict):
            raise RuntimeError("draft read-back was not an object")
        return draft

    def publish(self, draft_id: int) -> dict:
        """Publish the draft. Email send is not a parameter; it stays off."""
        return self._request(
            "POST",
            self._url(f"/drafts/{draft_id}/publish"),
            json_body=publish_payload(),
            referer="/publish/post",
        )

    def _url(self, path: str) -> str:
        return f"{self.publication_url}/api/v1{path}"

    def _request(
        self,
        method: str,
        url: str,
        *,
        json_body: dict | None,
        referer: str,
    ) -> dict:
        headers = {
            "Cookie": f"substack.sid={self._sid}; connect.sid={self._sid}",
            "Referer": f"{self.publication_url}{referer}",
            "Accept": "application/json",
        }
        response = self._http.request(method, url, headers=headers, json=json_body)
        if response.status_code >= 400:
            raise SubstackError(method, url, response.status_code, response.text)
        if not response.content:
            raise SubstackError(method, url, response.status_code, "empty body")
        parsed = response.json()
        if not isinstance(parsed, dict):
            raise RuntimeError(f"Substack {method} {url} returned {type(parsed).__name__}")
        return parsed
