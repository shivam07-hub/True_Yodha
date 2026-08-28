"""The DDL properties that make track 1 free and a track private.

Applied to prod 2026-08-28. These assert the shape, not that it ran.
"""
from pathlib import Path

MIGRATION = Path(__file__).parents[2] / "database/migrations/20260828090000_job_tracks.sql"


def test_track_id_is_nullable_so_track_one_needs_no_row() -> None:
    """NULL means the profile. A NOT NULL column here would require
    backfilling 238 users into a structure 83% of them never asked for.
    """
    sql = MIGRATION.read_text()

    assert "add column if not exists track_id bigint" in sql
    assert "track_id bigint not null" not in sql.lower()


def test_a_stored_track_can_never_claim_position_one() -> None:
    """Track 1 is the profile. A row at position 1 is a second one."""
    sql = MIGRATION.read_text()

    assert "job_tracks_position_after_profile check (position >= 2)" in sql


def test_two_concurrent_opens_cannot_both_take_a_position() -> None:
    """The check that picks the next position cannot see a commit made after
    it read, so the invariant has to live in the index, not in Python.
    """
    sql = MIGRATION.read_text()

    assert "create unique index if not exists job_tracks_user_position_live_idx" in sql
    assert "on public.job_tracks (user_id, position)" in sql
    # Partial on live rows: closing a track must free its slot.
    assert "where archived_at is null" in sql


def test_a_track_is_private_to_its_owner() -> None:
    sql = MIGRATION.read_text()

    # "read", not "select" — the naming convention every other RLS policy in
    # database/migrations uses ("own career target snapshots read").
    for verb in ("read", "insert", "update"):
        assert f'create policy "own job tracks {verb}"' in sql
    assert "enable row level security" in sql
    assert "revoke all on public.job_tracks from anon, authenticated" in sql
    # No delete grant: archiving keeps a closed track's matches attached to the
    # search that produced them.
    assert "grant select, insert, update on public.job_tracks to authenticated" in sql


def test_dropping_a_track_never_drops_its_matches() -> None:
    sql = MIGRATION.read_text()

    assert "references public.job_tracks (id) on delete set null" in sql


def test_the_match_index_skips_the_track_one_majority() -> None:
    """Almost every row carries NULL, and the only question asked of this
    column is "which rows belong to track N"."""
    sql = MIGRATION.read_text()

    assert "create index if not exists user_job_matches_track_idx" in sql
    assert "on public.user_job_matches (user_id, track_id)\n    where track_id is not null" in sql
