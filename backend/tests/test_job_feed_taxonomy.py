import hashlib
import json

import pytest

from app.services.job_feed.taxonomy import (
    JobFeedTaxonomyMismatchError,
    assert_matching_taxonomy_checksum,
    taxonomy_sha256,
    verify_taxonomy_integrity,
)


def test_taxonomy_sha256_is_stable(tmp_path) -> None:
    taxonomy = tmp_path / "lightcast_skills_taxonomy.json"
    taxonomy.write_text('{"skills": ["Python"]}', encoding="utf-8")

    assert taxonomy_sha256(taxonomy) == taxonomy_sha256(taxonomy)


def test_assert_matching_taxonomy_checksum_returns_checksum(tmp_path) -> None:
    mirror = tmp_path / "mirror.json"
    crawler = tmp_path / "crawler.json"
    mirror.write_text('{"skills": ["Python"]}', encoding="utf-8")
    crawler.write_text('{"skills": ["Python"]}', encoding="utf-8")

    assert assert_matching_taxonomy_checksum(mirror, crawler) == taxonomy_sha256(mirror)


def test_assert_matching_taxonomy_checksum_raises_on_mismatch(tmp_path) -> None:
    mirror = tmp_path / "mirror.json"
    crawler = tmp_path / "crawler.json"
    mirror.write_text('{"skills": ["Python"]}', encoding="utf-8")
    crawler.write_text('{"skills": ["SQL"]}', encoding="utf-8")

    with pytest.raises(JobFeedTaxonomyMismatchError):
        assert_matching_taxonomy_checksum(mirror, crawler)


# ── verify_taxonomy_integrity ──────────────────────────────────────────────────

def _make_versioned_taxonomy(tmp_path, content: dict, version: str = "1.0.0") -> object:
    content_sha = hashlib.sha256(
        json.dumps(content, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    data = {"_meta": {"version": version, "sha256": content_sha}, **content}
    path = tmp_path / "taxonomy.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def test_verify_taxonomy_integrity_returns_version(tmp_path) -> None:
    path = _make_versioned_taxonomy(tmp_path, {"name": "root", "children": []}, version="1.0.0")
    assert verify_taxonomy_integrity(path) == "1.0.0"


def test_verify_taxonomy_integrity_raises_on_missing_meta(tmp_path) -> None:
    path = tmp_path / "taxonomy.json"
    path.write_text('{"name": "root", "children": []}', encoding="utf-8")

    with pytest.raises(JobFeedTaxonomyMismatchError, match="_meta"):
        verify_taxonomy_integrity(path)


def test_verify_taxonomy_integrity_raises_on_tampered_content(tmp_path) -> None:
    path = _make_versioned_taxonomy(tmp_path, {"name": "root", "children": []})
    data = json.loads(path.read_bytes())
    data["name"] = "tampered"  # change content without updating sha256
    path.write_text(json.dumps(data), encoding="utf-8")

    with pytest.raises(JobFeedTaxonomyMismatchError, match="checksum"):
        verify_taxonomy_integrity(path)


def test_verify_taxonomy_integrity_passes_on_real_taxonomy() -> None:
    """The live taxonomy file must pass integrity check at version 1.0.0."""
    from pathlib import Path
    taxonomy_path = Path(__file__).resolve().parents[1] / "lightcast_skills_taxonomy.json"
    assert verify_taxonomy_integrity(taxonomy_path) == "1.0.0"

