"""Matching + filtering consolidation package.

One home for the two job pipelines that were structurally disconnected:
  - JobRanking (ranking.py) — deterministic overlap + brain, the "matches" path.
  - FilterSpec / JobQuery (filter_spec.py / job_query.py) — the "feed/search" path.

Facades DELEGATE to the tuned stages (job_matcher, llm_ranker) and the tuned SQL
(repositories.jobs.feed_jobs); they never reimplement them.
"""
