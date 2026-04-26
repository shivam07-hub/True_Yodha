import pytest

from app.services.job_feed.taxonomy import (
    JobFeedTaxonomyMismatchError,
    assert_matching_taxonomy_checksum,
    taxonomy_sha256,
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

