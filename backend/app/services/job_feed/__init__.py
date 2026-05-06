"""
Job Feed contract.

Owns the row shape at the seam between the external Firecrawl_Supabase crawler
and Mirror's public.jobs table.
"""

from app.services.job_feed.contract import (
    JobFeedContractError,
    JobFeedRow,
    normalize_job_feed_row,
)
from app.services.job_feed.importer import (
    JobFeedImportReport,
    JobFeedLocationQualityError,
    import_job_feed_rows,
    quality_score,
)
from app.services.job_feed.taxonomy import (
    JobFeedTaxonomyMismatchError,
    assert_matching_taxonomy_checksum,
    taxonomy_sha256,
    verify_taxonomy_integrity,
)

__all__ = [
    "JobFeedContractError",
    "JobFeedImportReport",
    "JobFeedLocationQualityError",
    "JobFeedRow",
    "JobFeedTaxonomyMismatchError",
    "assert_matching_taxonomy_checksum",
    "import_job_feed_rows",
    "normalize_job_feed_row",
    "quality_score",
    "taxonomy_sha256",
    "verify_taxonomy_integrity",
]
