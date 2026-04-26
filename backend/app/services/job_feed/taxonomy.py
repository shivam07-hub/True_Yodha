from __future__ import annotations

import hashlib
import json
from pathlib import Path


class JobFeedTaxonomyMismatchError(ValueError):
    """Raised when crawler and Mirror taxonomy artifacts do not match."""


def taxonomy_sha256(path: str | Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def assert_matching_taxonomy_checksum(
    mirror_taxonomy_path: str | Path,
    crawler_taxonomy_path: str | Path,
) -> str:
    mirror_checksum = taxonomy_sha256(mirror_taxonomy_path)
    crawler_checksum = taxonomy_sha256(crawler_taxonomy_path)
    if mirror_checksum != crawler_checksum:
        raise JobFeedTaxonomyMismatchError(
            "Lightcast taxonomy checksum mismatch between Mirror and Firecrawl crawler"
        )
    return mirror_checksum


def verify_taxonomy_integrity(path: str | Path) -> str:
    """Verify taxonomy _meta.sha256 matches actual content. Returns version string."""
    data = json.loads(Path(path).read_bytes())
    meta = data.get("_meta")
    if not meta or not isinstance(meta, dict):
        raise JobFeedTaxonomyMismatchError(
            f"Taxonomy file {path} is missing _meta block — run Phase 4 migration"
        )
    expected_sha = meta.get("sha256", "")
    content = {k: v for k, v in data.items() if k != "_meta"}
    actual_sha = hashlib.sha256(
        json.dumps(content, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    if actual_sha != expected_sha:
        raise JobFeedTaxonomyMismatchError(
            f"Taxonomy content checksum mismatch: "
            f"expected {expected_sha[:12]}… got {actual_sha[:12]}…"
        )
    return str(meta.get("version", "unknown"))

