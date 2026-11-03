"""Publish a carousel to Myro's Instagram account from the Distribution Tracker.

Instagram API with Instagram Login, on graph.instagram.com. A carousel is three
steps: one container per slide, one carousel container that holds them and the
caption, then media_publish. Instagram fetches every slide itself, from a public
JPEG URL, so the slides go to the public ``growth-media`` bucket first.
https://developers.facebook.com/docs/instagram-platform/content-publishing

A publish is never run twice. The media id Instagram returns is written to the
message before anything else happens, and a retry that finds it only reads the
permalink back.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable

import httpx

from app.config import settings
from app.schemas.growth import PublicationCreate

GRAPH_HOST = "https://graph.instagram.com"
MEDIA_BUCKET = "growth-media"
MAX_CAROUSEL_ITEMS = 20
MAX_CAPTION_CHARS = 2200
MAX_SLIDE_BYTES = 8 * 1024 * 1024
# Instagram's own guidance is to poll a container for no more than five minutes.
# Image containers usually finish within seconds, so the interval is short.
POLL_INTERVAL_SECONDS = 3.0
POLL_DEADLINE_SECONDS = 300.0


class InstagramPublishError(RuntimeError):
    """A step failed. The text is Meta's own error message, never the token."""


@dataclass(frozen=True)
class InstagramAccount:
    user_id: str
    access_token: str
    graph_version: str


def configured_account() -> InstagramAccount | None:
    if not settings.instagram_user_id or not settings.instagram_access_token:
        return None
    return InstagramAccount(
        user_id=settings.instagram_user_id,
        access_token=settings.instagram_access_token,
        graph_version=settings.instagram_graph_version,
    )


class InstagramClient:
    def __init__(
        self,
        account: InstagramAccount,
        http: httpx.Client,
        *,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.account = account
        self.http = http
        self.sleep = sleep
        self.clock = clock

    def _call(
        self, method: str, path: str, fields: dict[str, str]
    ) -> dict[str, Any]:
        url = f"{GRAPH_HOST}/{self.account.graph_version}/{path}"
        auth = {"access_token": self.account.access_token}
        try:
            # POSTs carry the token in the form body, so it never sits in a URL.
            if method == "POST":
                response = self.http.post(url, data={**fields, **auth})
            else:
                response = self.http.get(url, params={**fields, **auth})
        except httpx.HTTPError as exc:
            raise InstagramPublishError(
                f"Could not reach Instagram ({exc.__class__.__name__})."
            ) from exc
        try:
            body = response.json()
        except ValueError:
            body = {}
        error = body.get("error") if isinstance(body, dict) else None
        if response.status_code >= 400 or error:
            message = (error or {}).get("message") if isinstance(error, dict) else None
            raise InstagramPublishError(
                message or f"Instagram answered HTTP {response.status_code}."
            )
        return body

    def create_carousel(self, image_urls: list[str], caption: str) -> str:
        children = [
            self._call(
                "POST",
                f"{self.account.user_id}/media",
                {"image_url": url, "is_carousel_item": "true"},
            )["id"]
            for url in image_urls
        ]
        for child in children:
            self.wait_until_finished(child)
        container = self._call(
            "POST",
            f"{self.account.user_id}/media",
            {
                "media_type": "CAROUSEL",
                "children": ",".join(children),
                "caption": caption,
            },
        )["id"]
        self.wait_until_finished(container)
        return container

    def wait_until_finished(self, container_id: str) -> None:
        deadline = self.clock() + POLL_DEADLINE_SECONDS
        while True:
            status = self._call("GET", container_id, {"fields": "status_code"}).get(
                "status_code"
            )
            if status == "FINISHED":
                return
            if status in ("ERROR", "EXPIRED"):
                raise InstagramPublishError(
                    f"Instagram could not process a slide (status {status})."
                )
            if self.clock() >= deadline:
                raise InstagramPublishError(
                    "Instagram was still processing the slides after five minutes."
                )
            self.sleep(POLL_INTERVAL_SECONDS)

    def publish(self, container_id: str) -> str:
        return self._call(
            "POST",
            f"{self.account.user_id}/media_publish",
            {"creation_id": container_id},
        )["id"]

    def permalink(self, media_id: str) -> str:
        link = self._call("GET", media_id, {"fields": "permalink"}).get("permalink")
        if not link:
            raise InstagramPublishError("Instagram returned no permalink for the post.")
        return link

    def comment(self, media_id: str, message: str) -> None:
        self._call("POST", f"{media_id}/comments", {"message": message})


def run_publish(
    repo: Any,
    account: InstagramAccount,
    message_id: str,
    image_urls: list[str],
    caption: str,
    first_comment: str,
    operator_id: str,
    *,
    http_factory: Callable[[], httpx.Client] = lambda: httpx.Client(timeout=30.0),
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    """The background half of Publish: post, record, then the first comment."""
    with http_factory() as http:
        client = InstagramClient(account, http, sleep=sleep)
        try:
            media_id = repo.instagram_media_id(message_id)
            if media_id is None:
                container = client.create_carousel(image_urls, caption)
                media_id = client.publish(container)
                repo.record_instagram_media(message_id, media_id)
            permalink = client.permalink(media_id)
        except InstagramPublishError as exc:
            repo.fail_message(message_id, str(exc))
            return

        outcome: dict[str, Any] = {}
        if first_comment.strip():
            try:
                client.comment(media_id, first_comment.strip())
                outcome["first_comment"] = "posted"
            except InstagramPublishError as exc:
                # The post is live; a missing comment is reported, not retried.
                outcome["first_comment_error"] = str(exc)

    repo.mark_published(
        message_id,
        PublicationCreate(
            live_url=permalink,
            external_id=media_id,
            final_copy_snapshot=caption,
            outcome=outcome,
        ),
        operator_id,
    )
