from __future__ import annotations

import hashlib
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

