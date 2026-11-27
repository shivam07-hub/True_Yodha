"""A newsletter spec writes its tracker rows, and a live post is left alone."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "backend" / "scripts" / "growth_kit_sync.py"
BIO = (
    "https://www.himyro.com/"
    "?utm_source=instagram&utm_medium=social&utm_campaign=ig-bio"
)


def sync_module():
    spec = importlib.util.spec_from_file_location("growth_kit_sync", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class MemoryStore:
    def __init__(self) -> None:
        self.assets: dict[str, dict[str, Any]] = {}
        self.campaigns: dict[str, dict[str, Any]] = {}
        self.messages: dict[str, dict[str, Any]] = {}
        self._n = 0

    def asset_by_slug(self, slug: str) -> dict[str, Any] | None:
        return next((row for row in self.assets.values() if row.get("slug") == slug), None)

    def campaign_by_key(self, key: str) -> dict[str, Any] | None:
        return self.campaigns.get(key)

    def message_by_key(self, key: str) -> dict[str, Any] | None:
        return self.messages.get(key)

    def _put(self, table: dict[str, dict[str, Any]], payload: dict[str, Any]) -> dict[str, Any]:
        key = payload["legacy_key"]
        self._n += 1
        current = table.get(key, {"id": f"id-{self._n}"})
        merged = {**current, **payload}
        table[key] = merged
        return merged

    def upsert_asset(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._put(self.assets, payload)

    def upsert_campaign(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._put(self.campaigns, payload)

    def upsert_message(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._put(self.messages, payload)


def _write_spec(tmp_path: Path) -> Path:
    spec = tmp_path / "issue-099.json"
    spec.write_text(
        json.dumps(
            {
                "issue": 99,
                "article": "2026-01-example",
                "out": "Myro Newsletter/Issue 099 - carousel",
                "first_comment": "#jobsearch #example #himyro",
                "slides": [
                    {"caption": "One opening, 1 of them."},
                    {"caption": "Two remain."},
                ],
            }
        )
    )
    (tmp_path / "issue-099-distribution.md").write_text(
        "# Issue 099 — where it goes\n\n"
        "Heading: Example heading.\n\n"
        "## LinkedIn\n\n"
        "The linkedin body.\n\n"
        "## X\n\n"
        "1. Unused.\n"
    )
    return spec


def test_a_post_with_no_article_fills_the_issue_it_posts_for(tmp_path: Path) -> None:
    """A reworked post quotes its own figures, so it has no article for the
    builder to check against, and still takes over its issue's rows."""
    mod = sync_module()
    spec = _write_spec(tmp_path)
    store = MemoryStore()
    mod.sync(store, spec, dry_run=False)
    slug = "2026-01-example"
    first = f"message:issue:{slug}:linkedin"
    store.messages[first]["status"] = "published"
    data = json.loads(spec.read_text())
    data["posts_for"] = data.pop("article")
    data["variant"] = "rework"
    post = tmp_path / "issue-099-post.json"
    post.write_text(json.dumps(data))
    (tmp_path / "issue-099-post-distribution.md").write_text(
        "Heading: Post heading.\n\n## LinkedIn\n\nThe reworked body.\n"
    )
    mod.sync(store, post, dry_run=False)
    # The first post stays the record of what went out.
    assert store.messages[first]["draft_copy"] == "The linkedin body."
    linkedin = store.messages[f"{first}:rework"]
    assert linkedin["variant"] == "rework"
    assert linkedin["status"] == "ready_for_review"
    assert linkedin["campaign_id"] == store.messages[first]["campaign_id"]
    assert linkedin["draft_copy"] == "The reworked body."
    assert linkedin["metadata"]["kit"].endswith("issue-099-post-distribution.md")


def test_a_published_row_is_not_written(tmp_path: Path) -> None:
    mod = sync_module()
    spec = _write_spec(tmp_path)
    store = MemoryStore()
    slug = "2026-01-example"
    store.assets["asset:issue:" + slug] = {
        "id": "asset-1",
        "legacy_key": "asset:issue:" + slug,
        "slug": slug,
        "kind": "newsletter",
        "status": "published",
        "canonical_url": f"https://www.himyro.com/newsletter/{slug}",
    }
    store.campaigns["campaign:issue:" + slug] = {
        "id": "camp-1",
        "legacy_key": "campaign:issue:" + slug,
        "slug": slug + "-launch",
        "asset_id": "asset-1",
    }
    key = f"message:issue:{slug}:instagram"
    store.messages[key] = {
        "id": "msg-ig",
        "legacy_key": key,
        "channel": "instagram",
        "format": "carousel",
        "status": "published",
        "planned_at": "2026-11-04T13:30:00+00:00",
        "draft_copy": "OLD",
        "utm_url": "https://example.test",
        "metadata": {"prepared_draft": "OLD"},
    }
    lines = mod.sync(store, spec, dry_run=False)
    assert any(line == "instagram skipped (published)" for line in lines)
    assert store.messages[key]["draft_copy"] == "OLD"
    assert store.messages[key]["metadata"] == {"prepared_draft": "OLD"}


def test_a_new_issue_creates_the_asset_campaign_and_both_messages(tmp_path: Path) -> None:
    mod = sync_module()
    spec = _write_spec(tmp_path)
    store = MemoryStore()
    mod.sync(store, spec, dry_run=False)
    slug = "2026-01-example"
    asset = store.assets["asset:issue:" + slug]
    assert asset["kind"] == "newsletter"
    assert asset["status"] == "published"
    assert asset["canonical_url"] == f"https://www.himyro.com/newsletter/{slug}"
    campaign = store.campaigns["campaign:issue:" + slug]
    assert campaign["slug"] == slug + "-launch"
    assert campaign["asset_id"] == asset["id"]
    instagram = store.messages[f"message:issue:{slug}:instagram"]
    linkedin = store.messages[f"message:issue:{slug}:linkedin"]
    assert instagram["format"] == "carousel"
    assert linkedin["format"] == "carousel"
    assert "planned_at" not in instagram
    assert "planned_at" not in linkedin
    assert instagram["metadata"]["bio_link"] == BIO
    assert instagram["metadata"]["first_comment"] == "#jobsearch #example #himyro"
    assert instagram["draft_copy"].startswith("Slide 1:\nOne opening, 1 of them.")
    # Posts send people to the CV upload on the home page, not the issue
    # (Shivam, 2026-11-22): the newsletter is the proof, Myro is the product.
    assert instagram["utm_url"] == (
        "https://www.himyro.com/"
        "?utm_source=instagram&utm_medium=social&utm_campaign=issue-099"
    )
    assert linkedin["draft_copy"] == "The linkedin body."
    assert linkedin["utm_url"] == (
        "https://www.himyro.com/"
        "?utm_source=linkedin&utm_medium=social&utm_campaign=issue-099"
    )


def test_running_twice_changes_nothing(tmp_path: Path) -> None:
    mod = sync_module()
    spec = _write_spec(tmp_path)
    store = MemoryStore()
    mod.sync(store, spec, dry_run=False)
    before = json.dumps(store.messages, sort_keys=True)
    lines = mod.sync(store, spec, dry_run=False)
    assert lines == []
    assert json.dumps(store.messages, sort_keys=True) == before


def test_an_existing_linkedin_post_keeps_its_format_and_date(tmp_path: Path) -> None:
    mod = sync_module()
    spec = _write_spec(tmp_path)
    store = MemoryStore()
    slug = "2026-01-example"
    store.assets["asset:issue:" + slug] = {
        "id": "asset-1",
        "legacy_key": "asset:issue:" + slug,
        "slug": slug,
        "kind": "newsletter",
        "status": "published",
        "canonical_url": f"https://www.himyro.com/newsletter/{slug}",
        "title": "Leave this title",
    }
    store.campaigns["campaign:issue:" + slug] = {
        "id": "camp-1",
        "legacy_key": "campaign:issue:" + slug,
        "slug": slug + "-launch",
        "asset_id": "asset-1",
        "name": "Leave this name",
        "planned_at": "2026-09-17T04:30:00+00:00",
    }
    key = f"message:issue:{slug}:linkedin"
    store.messages[key] = {
        "id": "msg-li",
        "legacy_key": key,
        "asset_id": "asset-1",
        "campaign_id": "camp-1",
        "channel": "linkedin",
        "format": "post",
        "status": "ready_for_review",
        "planned_at": "2026-11-24T05:00:00+00:00",
        "draft_copy": "old",
        "utm_url": "old",
        "metadata": {},
    }
    mod.sync(store, spec, dry_run=False)
    row = store.messages[key]
    assert row["format"] == "post"
    assert row["planned_at"] == "2026-11-24T05:00:00+00:00"
    assert row["draft_copy"] == "The linkedin body."
    assert store.assets["asset:issue:" + slug]["title"] == "Leave this title"
    assert store.campaigns["campaign:issue:" + slug]["name"] == "Leave this name"


def test_an_update_carries_the_ids_postgres_checks_before_conflict() -> None:
    mod = sync_module()
    payload = mod._message_payload(
        key="message:issue:example:linkedin",
        channel="linkedin",
        draft="The linkedin body.",
        utm="https://www.himyro.com/newsletter/example",
        metadata={"prepared_draft": "The linkedin body."},
        asset_id="unused",
        campaign_id="unused",
        current={
            "asset_id": "asset-1",
            "campaign_id": "camp-1",
            "channel": "linkedin",
            "format": "post",
            "planned_at": "2026-11-24T05:00:00+00:00",
            "metadata": {},
        },
        create_format="carousel",
    )
    assert payload["asset_id"] == "asset-1"
    assert payload["campaign_id"] == "camp-1"
    assert payload["channel"] == "linkedin"
    assert "format" not in payload
    assert "planned_at" not in payload


def test_issue_024_laptop_wording_is_the_live_sentence() -> None:
    mod = sync_module()
    spec = json.loads(
        (ROOT / "scripts/newsletter-carousel-specs/issue-024.json").read_text()
    )
    assert mod.instagram_how_to_post(spec) == (
        "On the laptop, at instagram.com: Create, Post, add the 7 slides in "
        "Myro Newsletter/Issue 024 - carousel/ in order, crop 4:5, keep Original, "
        "paste caption-laptop.txt from that folder, Share. Hashtags in the first "
        "comment. Once Instagram is connected, Publish to Instagram in this row "
        "does the same."
    )
    assert mod.instagram_draft(spec).startswith("Slide 1:\nIf you are starting out")
    assert "\n\nSlide 2:\nIf you are starting out, start with" in mod.instagram_draft(spec)


def test_linkedin_posts_the_kit_as_one_document() -> None:
    mod = sync_module()
    spec = json.loads(
        (ROOT / "scripts/newsletter-carousel-specs/issue-026.json").read_text()
    )
    assert mod.linkedin_how_to_post(spec) == (
        "Add a document: Myro Newsletter/Issue 026 - carousel/issue-026-linkedin.pdf "
        "(8 pages), titled with the first slide's line. A document post can be "
        "boosted; a multi-image post cannot."
    )
