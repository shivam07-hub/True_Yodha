from __future__ import annotations

from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "database/migrations/20260726180000_learning_ladder_content_foundation.sql"
)


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


def test_learning_ladder_migration_adds_reviewed_publication_contract() -> None:
    sql = _sql()

    assert "create table if not exists public.learning_content_editions" in sql
    assert "create table if not exists public.learning_source_allowlist" in sql
    assert "add column if not exists content_edition_id" in sql
    assert "add column if not exists review_status" in sql
    assert "add column if not exists generation_provenance" in sql
    assert "add column if not exists source_provenance" in sql
    assert "add column if not exists license_posture" in sql
    assert "add column if not exists reviewer" in sql
    assert "add column if not exists verified_at" in sql
    assert "add column if not exists rationales" in sql
    assert "review_status = 'published'" in sql


def test_learning_ladder_migration_preserves_attempt_history_with_snapshots() -> None:
    sql = _sql()

    assert "create table if not exists public.quiz_attempt_question_snapshots" in sql
    assert "question_text       text not null" in sql
    assert "correct_index       integer not null" in sql
    assert "rationales          jsonb not null" in sql
    assert "content_edition_id  uuid references public.learning_content_editions(id)" in sql
    assert "primary key (attempt_id, question_id)" in sql
    assert "on delete cascade" in sql


def test_learning_ladder_migration_uses_rls_without_cv_skill_mutation() -> None:
    sql = _sql()

    assert "alter table public.learning_content_editions enable row level security" in sql
    assert "alter table public.learning_source_allowlist enable row level security" in sql
    assert "alter table public.quiz_attempt_question_snapshots enable row level security" in sql
    assert "to authenticated" in sql
    assert "a.user_id = (select auth.uid())" in sql
    assert "update public.user_skills" not in sql
    assert "insert into public.user_skills" not in sql
