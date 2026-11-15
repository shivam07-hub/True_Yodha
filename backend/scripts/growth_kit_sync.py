#!/usr/bin/env python3
"""Write one newsletter's tracker rows from its carousel spec.

The spec owns the captions. This command copies them onto the asset, the
launch campaign, and the Instagram and LinkedIn messages. A message that is
already published or queued is left as it is.

    PYTHONPATH=backend backend/.venv/bin/python backend/scripts/growth_kit_sync.py \\
        scripts/newsletter-carousel-specs/issue-024.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Protocol

ROOT = Path(__file__).resolve().parents[2]
BIO_LINK = (
    "https://www.himyro.com/newsletter"
    "?utm_source=instagram&utm_medium=social&utm_campaign=ig-bio"
)
SKIP_STATUSES = frozenset({"published", "queued"})


class Store(Protocol):
    def asset_by_slug(self, slug: str) -> dict[str, Any] | None: ...

    def campaign_by_key(self, key: str) -> dict[str, Any] | None: ...

    def message_by_key(self, key: str) -> dict[str, Any] | None: ...

    def upsert_asset(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    def upsert_campaign(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    def upsert_message(self, payload: dict[str, Any]) -> dict[str, Any]: ...


def instagram_draft(spec: dict[str, Any]) -> str:
    parts = [
        f"Slide {index}:\n{slide['caption'].strip()}"
        for index, slide in enumerate(spec["slides"], start=1)
    ]
    return "\n\n".join(parts)


def instagram_how_to_post(spec: dict[str, Any]) -> str:
    count = len(spec["slides"])
    folder = str(spec["out"]).rstrip("/")
    return (
        "On the laptop, at instagram.com: Create, Post, add the "
        f"{count} slides in {folder}/ in order, crop 4:5, keep Original, "
        "paste caption-laptop.txt from that folder, Share. Hashtags in the "
        "first comment. Once Instagram is connected, Publish to Instagram "
        "in this row does the same."
    )


def linkedin_how_to_post(spec: dict[str, Any]) -> str:
    count = len(spec["slides"])
    folder = str(spec["out"]).rstrip("/")
    return f"Upload the {count} slides in {folder}/ in order."


def linkedin_draft(distribution: str) -> str:
    marker = "## LinkedIn\n"
    start = distribution.index(marker) + len(marker)
    rest = distribution[start:]
    end = rest.find("\n## ")
    body = rest if end < 0 else rest[:end]
    return body.strip()


def _kit_path(spec_path: Path) -> str:
    distribution = spec_path.with_name(spec_path.stem + "-distribution.md")
    try:
        return distribution.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return distribution.as_posix()


def _utm(slug: str, issue: int, channel: str) -> str:
    return (
        f"https://www.himyro.com/newsletter/{slug}"
        f"?utm_source={channel}&utm_medium=social&utm_campaign=issue-{issue:03d}"
    )


def _heading(distribution: str) -> str:
    for line in distribution.splitlines():
        if line.startswith("Heading: "):
            return line.removeprefix("Heading: ").strip()
    raise SystemExit("the distribution file has no Heading line")


def _instagram_metadata(spec: dict[str, Any], draft: str, kit: str) -> dict[str, Any]:
    return {
        "prepared_draft": draft,
        "first_comment": spec["first_comment"],
        "bio_link": BIO_LINK,
        "kit": kit,
        "how_to_post": instagram_how_to_post(spec),
    }


def _linkedin_metadata(spec: dict[str, Any], draft: str, kit: str) -> dict[str, Any]:
    return {
        "prepared_draft": draft,
        "kit": kit,
        "how_to_post": linkedin_how_to_post(spec),
    }


def _diff(channel: str, current: dict[str, Any] | None, wanted: dict[str, Any]) -> list[str]:
    if current is None:
        lines = [f"{channel}.{name}" for name in ("draft_copy", "utm_url", "format")]
        lines.extend(f"{channel}.metadata.{key}" for key in sorted(wanted["metadata"]))
        return lines
    lines = []
    for name in ("draft_copy", "utm_url"):
        if current.get(name) != wanted[name]:
            lines.append(f"{channel}.{name}")
    current_meta = current.get("metadata") or {}
    merged = {**current_meta, **wanted["metadata"]}
    for key in sorted(wanted["metadata"]):
        if current_meta.get(key) != merged[key]:
            lines.append(f"{channel}.metadata.{key}")
    return lines


def _message_payload(
    *,
    key: str,
    channel: str,
    draft: str,
    utm: str,
    metadata: dict[str, Any],
    asset_id: str,
    campaign_id: str,
    current: dict[str, Any] | None,
    create_format: str,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "legacy_key": key,
        "draft_copy": draft,
        "utm_url": utm,
        "metadata": {**(current.get("metadata") if current else {}), **metadata},
    }
    if current is None:
        payload.update(
            {
                "asset_id": asset_id,
                "campaign_id": campaign_id,
                "channel": channel,
                "format": create_format,
                "variant": "primary",
                "status": "ready_for_review",
                "automation_level": "manual",
            }
        )
    else:
        # Postgres checks NOT NULL on the inserted row before ON CONFLICT
        # can turn it into an update, so the existing ids have to travel.
        payload.update(
            {
                "asset_id": current["asset_id"],
                "campaign_id": current["campaign_id"],
                "channel": current.get("channel") or channel,
            }
        )
    return payload


def sync(store: Store, spec_path: Path, *, dry_run: bool) -> list[str]:
    spec_path = spec_path.resolve()
    spec = json.loads(spec_path.read_text())
    if any("caption" not in slide for slide in spec["slides"]):
        raise SystemExit(f"{spec_path.name} has a slide with no caption")
    distribution_path = spec_path.with_name(spec_path.stem + "-distribution.md")
    distribution = distribution_path.read_text()
    slug = spec["article"]
    issue = int(spec["issue"])
    kit = _kit_path(spec_path)
    asset_key = f"asset:issue:{slug}"
    campaign_key = f"campaign:issue:{slug}"

    lines: list[str] = []
    asset = store.asset_by_slug(slug)
    if asset is None:
        lines.append("asset")
        if not dry_run:
            asset = store.upsert_asset(
                {
                    "legacy_key": asset_key,
                    "kind": "newsletter",
                    "title": _heading(distribution),
                    "slug": slug,
                    "canonical_url": f"https://www.himyro.com/newsletter/{slug}",
                    "status": "published",
                    "sensitivity": "low",
                }
            )
    elif (
        asset.get("kind") != "newsletter"
        or asset.get("status") != "published"
        or asset.get("canonical_url") != f"https://www.himyro.com/newsletter/{slug}"
    ):
        lines.append("asset")
        if not dry_run:
            asset = store.upsert_asset(
                {
                    "legacy_key": asset.get("legacy_key") or asset_key,
                    "kind": "newsletter",
                    "slug": slug,
                    "canonical_url": f"https://www.himyro.com/newsletter/{slug}",
                    "status": "published",
                }
            )
    if asset is None:
        asset = {"id": None}

    campaign = store.campaign_by_key(campaign_key)
    if campaign is None:
        lines.append("campaign")
        if not dry_run:
            campaign = store.upsert_campaign(
                {
                    "legacy_key": campaign_key,
                    "asset_id": asset["id"],
                    "slug": f"{slug}-launch",
                    "name": f"Issue {issue:03d}",
                    "objective": (
                        "Carry the issue's numbers to LinkedIn, X and Instagram "
                        "the week it ships."
                    ),
                    "status": "ready_for_review",
                    "metadata": {"source": "MARKETING_SCHEDULE.md"},
                }
            )
    if campaign is None:
        campaign = {"id": None}

    channels = (
        (
            "instagram",
            instagram_draft(spec),
            _instagram_metadata(spec, instagram_draft(spec), kit),
            "carousel",
        ),
        (
            "linkedin",
            linkedin_draft(distribution),
            _linkedin_metadata(spec, linkedin_draft(distribution), kit),
            "carousel",
        ),
    )
    for channel, draft, metadata, create_format in channels:
        key = f"message:issue:{slug}:{channel}"
        current = store.message_by_key(key)
        if current is not None and current.get("status") in SKIP_STATUSES:
            lines.append(f"{channel} skipped ({current.get('status')})")
            continue
        wanted = {"draft_copy": draft, "utm_url": _utm(slug, issue, channel), "metadata": metadata}
        changed = _diff(channel, current, wanted)
        lines.extend(changed)
        if changed and not dry_run:
            store.upsert_message(
                _message_payload(
                    key=key,
                    channel=channel,
                    draft=draft,
                    utm=wanted["utm_url"],
                    metadata=metadata,
                    asset_id=asset["id"],
                    campaign_id=campaign["id"],
                    current=current,
                    create_format=create_format,
                )
            )
    return lines


def _rows(result: Any) -> list[dict[str, Any]]:
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    return []


class RepositoryStore:
    """The growth tables, through the repository's client. No new methods."""

    def __init__(self, repo: Any) -> None:
        self.repo = repo

    def _one(self, table: str, column: str, value: str) -> dict[str, Any] | None:
        rows = _rows(
            self.repo.db.table(table).select("*").eq(column, value).limit(1).execute()
        )
        return rows[0] if rows else None

    def asset_by_slug(self, slug: str) -> dict[str, Any] | None:
        return self._one("growth_content_assets", "slug", slug)

    def campaign_by_key(self, key: str) -> dict[str, Any] | None:
        return self._one("growth_campaigns", "legacy_key", key)

    def message_by_key(self, key: str) -> dict[str, Any] | None:
        return self._one("growth_messages", "legacy_key", key)

    def upsert_asset(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.repo.upsert_asset(payload)

    def upsert_campaign(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.repo.upsert_campaign(payload)

    def upsert_message(self, payload: dict[str, Any]) -> dict[str, Any]:
        rows = _rows(
            self.repo.db.table("growth_messages")
            .upsert(payload, on_conflict="legacy_key", ignore_duplicates=False)
            .execute()
        )
        if not rows:
            raise RuntimeError(payload["legacy_key"])
        return rows[0]


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Sync one newsletter kit into the tracker.")
    parser.add_argument("spec", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    from app.database import get_supabase_admin
    from app.repositories.growth import GrowthRepository

    lines = sync(
        RepositoryStore(GrowthRepository(get_supabase_admin())),
        args.spec,
        dry_run=args.dry_run,
    )
    for line in lines:
        print(line)


if __name__ == "__main__":
    main(sys.argv[1:])
