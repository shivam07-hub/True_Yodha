from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories.growth import get_growth_repository
from app.routers.growth import get_growth_operator
from app.schemas.growth import GrowthOperator
from app.services import instagram_publisher
from app.services.instagram_publisher import (
    InstagramAccount,
    InstagramClient,
    InstagramPublishError,
    run_publish,
)

ACCOUNT = InstagramAccount(user_id="1784", access_token="SECRET-TOKEN", graph_version="v26.0")
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64


class _FakeMeta:
    """Meta's carousel endpoints, recording every call."""

    def __init__(self, *, fail_on: str | None = None, statuses: list[str] | None = None):
        self.calls: list[tuple[str, str, dict[str, str]]] = []
        self.fail_on = fail_on
        self.statuses = list(statuses or [])
        self.children = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if request.method == "POST":
            fields = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
        else:
            fields = dict(request.url.params)
        self.calls.append((request.method, path, fields))
        if self.fail_on and self.fail_on in path:
            return httpx.Response(
                400, json={"error": {"message": "Invalid parameter", "code": 100}}
            )
        if path.endswith("/1784/media") and fields.get("is_carousel_item") == "true":
            self.children += 1
            return httpx.Response(200, json={"id": f"child-{self.children}"})
        if path.endswith("/1784/media"):
            return httpx.Response(200, json={"id": "carousel-1"})
        if path.endswith("/1784/media_publish"):
            return httpx.Response(200, json={"id": "media-9"})
        if path.endswith("/media-9/comments"):
            return httpx.Response(200, json={"id": "comment-1"})
        if fields.get("fields") == "status_code":
            status = self.statuses.pop(0) if self.statuses else "FINISHED"
            return httpx.Response(200, json={"status_code": status})
        if fields.get("fields") == "permalink":
            return httpx.Response(
                200, json={"permalink": "https://www.instagram.com/p/ABC123/"}
            )
        return httpx.Response(404, json={"error": {"message": f"unexpected {path}"}})


def _client(meta: _FakeMeta, **kwargs: Any) -> InstagramClient:
    return InstagramClient(
        ACCOUNT, httpx.Client(transport=httpx.MockTransport(meta)), sleep=lambda _s: None, **kwargs
    )


class _Repo:
    def __init__(self, media_id: str | None = None) -> None:
        self.media_id = media_id
        self.recorded: list[str] = []
        self.failed: list[str] = []
        self.published: list[Any] = []

    def instagram_media_id(self, _message_id: str) -> str | None:
        return self.media_id

    def record_instagram_media(self, _message_id: str, media_id: str) -> None:
        self.recorded.append(media_id)

    def fail_message(self, _message_id: str, reason: str) -> None:
        self.failed.append(reason)

    def mark_published(self, message_id: str, body: Any, operator_id: str) -> dict[str, Any]:
        self.published.append((message_id, body, operator_id))
        return {}


def _run(repo: _Repo, meta: _FakeMeta, first_comment: str = "") -> None:
    run_publish(
        repo,
        ACCOUNT,
        "message-1",
        ["https://cdn/01.jpg", "https://cdn/02.jpg"],
        "Caption text",
        first_comment,
        "operator-1",
        http_factory=lambda: httpx.Client(transport=httpx.MockTransport(meta)),
        sleep=lambda _s: None,
    )


def test_carousel_posts_children_then_carousel_then_publishes() -> None:
    meta = _FakeMeta()
    client = _client(meta)

    container = client.create_carousel(["https://cdn/01.jpg", "https://cdn/02.jpg"], "Hi")
    media_id = client.publish(container)

    posts = [(path, fields) for method, path, fields in meta.calls if method == "POST"]
    assert [fields.get("image_url") for _, fields in posts[:2]] == [
        "https://cdn/01.jpg",
        "https://cdn/02.jpg",
    ]
    assert posts[2][1]["media_type"] == "CAROUSEL"
    assert posts[2][1]["children"] == "child-1,child-2"
    assert posts[2][1]["caption"] == "Hi"
    assert posts[3][0] == "/v26.0/1784/media_publish"
    assert posts[3][1]["creation_id"] == "carousel-1"
    assert media_id == "media-9"


def test_the_token_rides_in_the_body_of_every_post() -> None:
    meta = _FakeMeta()
    _client(meta).create_carousel(["https://cdn/01.jpg", "https://cdn/02.jpg"], "Hi")

    for method, _path, fields in meta.calls:
        assert fields["access_token"] == "SECRET-TOKEN"
    post_urls = [c for c in meta.calls if c[0] == "POST"]
    assert post_urls and all("SECRET" not in path for _m, path, _f in post_urls)


def test_metas_error_text_is_raised_without_the_token() -> None:
    meta = _FakeMeta(fail_on="/1784/media")

    with pytest.raises(InstagramPublishError) as raised:
        _client(meta).create_carousel(["https://cdn/01.jpg", "https://cdn/02.jpg"], "Hi")

    assert str(raised.value) == "Invalid parameter"
    assert "SECRET" not in str(raised.value)


def test_a_slide_that_errors_stops_the_publish() -> None:
    meta = _FakeMeta(statuses=["IN_PROGRESS", "ERROR"])

    with pytest.raises(InstagramPublishError, match="status ERROR"):
        _client(meta).create_carousel(["https://cdn/01.jpg", "https://cdn/02.jpg"], "Hi")


def test_polling_gives_up_after_five_minutes() -> None:
    meta = _FakeMeta(statuses=["IN_PROGRESS"] * 1000)
    ticks = iter(range(0, 10_000, 60))
    client = _client(meta, clock=lambda: float(next(ticks)))

    with pytest.raises(InstagramPublishError, match="five minutes"):
        client.wait_until_finished("child-1")


def test_run_publish_records_the_media_id_then_the_live_link() -> None:
    repo = _Repo()
    meta = _FakeMeta()

    _run(repo, meta, first_comment="#jobsearch #himyro")

    assert repo.recorded == ["media-9"]
    assert repo.failed == []
    (message_id, body, operator_id), = repo.published
    assert message_id == "message-1" and operator_id == "operator-1"
    assert body.live_url == "https://www.instagram.com/p/ABC123/"
    assert body.external_id == "media-9"
    assert body.final_copy_snapshot == "Caption text"
    assert body.outcome == {"first_comment": "posted"}
    assert ("POST", "/v26.0/media-9/comments") in [(m, p) for m, p, _f in meta.calls]


def test_a_retry_after_a_live_post_never_posts_again() -> None:
    repo = _Repo(media_id="media-9")
    meta = _FakeMeta()

    _run(repo, meta)

    assert [m for m, _p, _f in meta.calls] == ["GET"]
    assert repo.recorded == []
    assert repo.published[0][1].live_url == "https://www.instagram.com/p/ABC123/"


def test_a_failed_publish_is_recorded_and_nothing_is_marked_live() -> None:
    repo = _Repo()
    meta = _FakeMeta(fail_on="media_publish")

    _run(repo, meta)

    assert repo.failed == ["Invalid parameter"]
    assert repo.recorded == []
    assert repo.published == []


def test_a_refused_first_comment_still_records_the_live_post() -> None:
    repo = _Repo()
    meta = _FakeMeta(fail_on="/comments")

    _run(repo, meta, first_comment="#jobsearch")

    body = repo.published[0][1]
    assert body.live_url == "https://www.instagram.com/p/ABC123/"
    assert body.outcome == {"first_comment_error": "Invalid parameter"}


# ── Route ────────────────────────────────────────────────────────────────────


class _RouteRepo:
    def __init__(self, *, live: bool = False, claim: bool = True) -> None:
        self.live = live
        self.claim = claim
        self.stored: list[bytes] = []

    def has_live_publication(self, _message_id: str) -> bool:
        return self.live

    def claim_for_instagram(self, message_id: str, _stale: str) -> dict[str, Any] | None:
        return {"id": message_id, "channel": "instagram", "status": "queued"} if self.claim else None

    def store_public_jpegs(self, bucket: str, folder: str, images: list[bytes]) -> list[str]:
        assert bucket == "growth-media" and folder.startswith("instagram/message-1/")
        self.stored = images
        return [f"https://cdn/{i}.jpg" for i in range(len(images))]


@pytest.fixture
def _operator():
    operator = GrowthOperator(user_id="operator-1", role="owner", active=True)
    app.dependency_overrides[get_growth_operator] = lambda: operator
    yield
    app.dependency_overrides.clear()


def _post(repo: _RouteRepo, files: list[bytes], caption: str = "Caption") -> httpx.Response:
    app.dependency_overrides[get_growth_repository] = lambda: repo
    with TestClient(app) as client:
        return client.post(
            "/growth/messages/message-1/instagram",
            files=[("slides", (f"{i:02d}.jpg", data, "image/jpeg")) for i, data in enumerate(files)],
            data={"caption": caption, "first_comment": "#himyro"},
        )


def test_the_route_is_closed_until_instagram_is_connected(_operator, monkeypatch) -> None:
    monkeypatch.setattr(instagram_publisher, "configured_account", lambda: None)

    response = _post(_RouteRepo(), [JPEG, JPEG])

    assert response.status_code == 503


def test_the_route_queues_the_post_and_hands_off(_operator, monkeypatch) -> None:
    ran: list[tuple[Any, ...]] = []
    monkeypatch.setattr(instagram_publisher, "configured_account", lambda: ACCOUNT)
    monkeypatch.setattr(instagram_publisher, "run_publish", lambda *args: ran.append(args))
    repo = _RouteRepo()

    response = _post(repo, [JPEG, JPEG])

    assert response.status_code == 202, response.text
    assert response.json()["status"] == "queued"
    assert repo.stored == [JPEG, JPEG]
    (_repo, account, message_id, urls, caption, comment, operator_id), = ran
    assert account == ACCOUNT and message_id == "message-1"
    assert urls == ["https://cdn/0.jpg", "https://cdn/1.jpg"]
    assert (caption, comment, operator_id) == ("Caption", "#himyro", "operator-1")


@pytest.mark.parametrize(
    ("repo", "files", "caption", "code"),
    [
        (_RouteRepo(), [JPEG], "Caption", 422),
        (_RouteRepo(), [JPEG, b"\x89PNG not a jpeg"], "Caption", 422),
        (_RouteRepo(), [JPEG, JPEG], "x" * 2201, 422),
        (_RouteRepo(live=True), [JPEG, JPEG], "Caption", 409),
        (_RouteRepo(claim=False), [JPEG, JPEG], "Caption", 409),
    ],
)
def test_the_route_refuses_what_instagram_or_a_second_click_would(
    _operator, monkeypatch, repo, files, caption, code
) -> None:
    monkeypatch.setattr(instagram_publisher, "configured_account", lambda: ACCOUNT)
    monkeypatch.setattr(instagram_publisher, "run_publish", lambda *args: None)

    response = _post(repo, files, caption)

    assert response.status_code == code, response.text
    assert repo.stored == []
