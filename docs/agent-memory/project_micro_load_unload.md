---
status: current
canonical_for: Micro database load, Unload listing, idle jobs indexes
superseded_by: null
verified_against: 1913f499 (2026-10-15)
retrieval: default
---

# Micro stays Micro — Unload is one statement

Shivam, 2026-10-14: Supabase stays Pro + Micro. Never propose a compute or disk upgrade. Reduce load.

Measured window 2026-10-15 03:00:28Z → 04:41:50Z (counters since 2026-07-12 01:22Z). Numbers live in `ARCHITECTURE_READ_PATH.md` §28 and `BACKLOG.md` R10.

## What shipped (`1913f499`)

- `unload(db, *, limit=500, archive_dir=None) -> int` calls `list_unload_candidates`, writes `job_archive_v1`, then `retire_closed_jobs` for those ids only. The offset page and the forty-id history probes are gone.
- No archive directory means return 0 and do not query. Railway leaves `JOB_UNLOAD_ARCHIVE_DIR` unset. The laptop script `python -m scripts.unload_closed_jobs` is the drain.
- A listing in `user_job_matches`, `job_applications`, `job_feedback_events`, or `job_reports` stays. Both the lister and the deleter enforce that. Quarantine is `deletion_eligible_at` and `quarantine_until`.
- Dropped, `DROP INDEX CONCURRENTLY`, rollback `CREATE` in `database/migrations/20261015140000_drop_idle_jobs_indexes.sql`: `idx_jobs_verification_queue`, `idx_jobs_verify_due`, `idx_jobs_verify_pending`, `idx_jobs_job_content_hash`, `idx_jobs_has_summary`.

## Do not undo

- Do not drop `idx_jobs_location_states_gin` (the feed filters `location_states`) or `idx_jobs_deletion_eligible` (Unload uses it). `idx_jobs_job_title_trgm` has one lifetime scan; the live title index is `idx_jobs_job_title_trgm_all`.
- Do not delete `job_verification_schedule`, `job_verification_interest`, or `verifier_sweep_heartbeat`. The claim stamps `job_verification_schedule.last_attempt_at`. Putting that stamp back on `jobs.last_verification_attempt_at` is how a claim returned to 3.2s (2026-08-13).
- `9d4ad00d` (inert verifier results skip the jobs rewrite) was not on `origin/main` at 2026-10-15 04:42Z. HOT share does not move until that deploys.

## Still open

`claim_verify_targets` was 7 calls, mean 2.3s, 16s total in the window — fifth, behind the unload page that this change removes. Compute stays Micro.
