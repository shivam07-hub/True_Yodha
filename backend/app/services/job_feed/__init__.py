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

__all__ = [
    "JobFeedContractError",
    "JobFeedRow",
    "normalize_job_feed_row",
]
