"""Upskilling grading + first-clear idempotency (PRD §4.3).

Covers the un-gameable reward contract:
  - server-side grading produces the right score/pass verdict,
  - the FIRST clear of a (skill, level) pays the score tier,
  - a re-clear of an already-paid level pays 0 (idempotent, no double-pay),
  - below the pass bar pays 0,
  - a re-submit of the SAME attempt replays without re-awarding.

Uses a tiny in-memory fake of the supabase fluent client so the real query
shapes in upskilling_service are exercised end-to-end without a DB.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.services import upskilling_service
from app.services.xp_policy import upskilling_award_for

SKILL_ID = 7
LEVEL = 2


# ── pure tier function ───────────────────────────────────────────────────────


def test_award_tiers():
    assert upskilling_award_for(10) == 50
    assert upskilling_award_for(9) == 30
    assert upskilling_award_for(8) == 20
    assert upskilling_award_for(7) == 0   # below the bar earns nothing
    assert upskilling_award_for(0) == 0


# ── in-memory fake supabase ──────────────────────────────────────────────────


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._op = "select"
        self._payload = None
        self._filters: list[tuple[str, str, object]] = []
        self._single = False

    # builders
    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def upsert(self, payload, on_conflict=None):
        self._op = "upsert"
        self._payload = payload
        self._conflict = (on_conflict or "").split(",")
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def gt(self, col, val):
        self._filters.append(("gt", col, val))
        return self

    def in_(self, col, vals):
        self._filters.append(("in", col, list(vals)))
        return self

    def is_(self, col, val):
        self._filters.append(("is", col, val))
        return self

    def order(self, _col, desc=False):
        return self

    def limit(self, _n):
        return self

    def maybe_single(self):
        self._single = True
        return self

    def single(self):
        self._single = True
        return self

    # resolution
    def _match(self, row):
        for kind, col, val in self._filters:
            if kind == "eq" and str(row.get(col)) != str(val):
                return False
            if kind == "gt" and not (row.get(col) or 0) > val:
                return False
            if kind == "in" and row.get(col) not in val:
                return False
            if kind == "is":
                actual = row.get(col)
                if val in (None, "null"):
                    if actual is not None:
                        return False
                elif actual != val:
                    return False
        return True

    def execute(self):
        rows = self._store.setdefault(self._table, [])
        if self._op == "select":
            hit = [r for r in rows if self._match(r)]
            return _Result(hit[0] if hit else None) if self._single else _Result(hit)
        if self._op == "insert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            created = []
            for it in items:
                row = dict(it)
                row.setdefault("id", f"{self._table}-{len(rows) + 1}")
                rows.append(row)
                created.append(row)
            return _Result(created)
        if self._op == "update":
            hit = [r for r in rows if self._match(r)]
            for r in hit:
                r.update(self._payload)
            return _Result(hit)
        if self._op == "upsert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            for it in items:
                existing = next(
                    (r for r in rows if all(str(r.get(k)) == str(it.get(k)) for k in self._conflict)),
                    None,
                )
                if existing:
                    existing.update(it)
                else:
                    rows.append(dict(it))
            return _Result(items)
        return _Result(None)


class _FakeAdmin:
    def __init__(self, store):
        self._store = store

    def table(self, name):
        return _Query(self._store, name)

    def rpc(self, _name, _params=None):
        return _Query(self._store, "_rpc")


def _seed_store(*, answer_all_correct=True, prior_clear=False, prior_clear_user="u1"):
    """A started 10-question attempt for (SKILL_ID, LEVEL). correct_index=1 for all."""
    questions = [
        {
            "id": qid,
            "skill_id": SKILL_ID,
            "skill_key": "sql",
            "level": LEVEL,
            "status": "active",
            "question_text": f"Q{qid}",
            "options": ["a", "b", "c", "d"],
            "correct_index": 1,
            "explanation": f"because {qid}",
        }
        for qid in range(1, 11)
    ]
    attempt = {
        "id": "att-1",
        "user_id": "u1",
        "skill_id": SKILL_ID,
        "level": LEVEL,
        "mode": "upskilling",
        "question_ids": [q["id"] for q in questions],
        "max_score": 10,
        "submitted_at": None,
        "score": None,
        "passed": None,
        "tokens_awarded": 0,
    }
    store = {
        "skill_questions": questions,
        "quiz_attempts": [attempt],
        "quiz_answers": [],
        "skill_assessed_level": [],
        "user_skills": [],
        "skill_certificates": [],
        "skills": [{"id": SKILL_ID, "taxonomy_key": "sql", "display_name": "SQL"}],
        "coin_ledger": [],
    }
    if prior_clear:
        store["coin_ledger"].append(
            {
                "id": "led-1",
                "user_id": prior_clear_user,
                "action": upskilling_service.CLEAR_ACTION,
                "ref_table": upskilling_service.CLEAR_REF_TABLE,
                "ref_id": upskilling_service._clear_ref_id(SKILL_ID, LEVEL),
                "delta": 20,
            }
        )
    return store


def _answers(correct: int):
    """First `correct` answers right (index 1), the rest wrong (index 0)."""
    return [
        {"question_id": qid, "selected_index": 1 if qid <= correct else 0}
        for qid in range(1, 11)
    ]


def _reviewed_fields(qid: int, *, correct_index: int = 1):
    return {
        "review_status": "published",
        "content_edition_id": "edition-1",
        "source_url": "https://www.postgresql.org/docs/current/tutorial-select.html",
        "source_provenance": "Official PostgreSQL documentation",
        "license_posture": "official_documentation_reference",
        "reviewer": "content-reviewer",
        "reviewed_at": "2026-07-26T00:00:00+00:00",
        "verified_at": "2026-07-26",
        "question_text": f"Q{qid}",
        "options": ["a", "b", "c", "d"],
        "correct_index": correct_index,
        "explanation": f"because {qid}",
        "rationales": {
            "correct": f"option {correct_index} follows the source",
            "distractors": {
                str(idx): f"option {idx} conflicts with the source"
                for idx in range(4)
                if idx != correct_index
            },
        },
    }


async def _run(store, answers):
    fake = _FakeAdmin(store)
    with patch("app.services.upskilling_service.get_supabase_admin", return_value=fake), \
         patch("app.services.upskilling_service.xp_service.get_xp_balance", new=AsyncMock(return_value=1000)), \
         patch("app.services.upskilling_service.xp_service.reward", new=AsyncMock(return_value=1020)) as reward:
        result = await upskilling_service.submit_set("u1", "att-1", answers, "idem-1")
    return result, reward


# ── behaviors ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_perfect_first_clear_awards_and_advances():
    store = _seed_store()
    result, reward = await _run(store, _answers(10))
    assert result["score"] == 10
    assert result["passed"] is True
    assert result["first_clear"] is True
    assert result["tokens_awarded"] == 50
    assert result["next_level_unlocked"] == LEVEL + 1
    reward.assert_awaited_once()
    # assessed level + grandfathered headline level advanced
    assert store["skill_assessed_level"][0]["assessed_level"] == LEVEL
    assert store["user_skills"] == []
    assert result["certificate"] is not None
    assert result["certificate"]["skill_display_name"] == "SQL"
    assert result["certificate"]["achieved_level"] == LEVEL


@pytest.mark.asyncio
async def test_reclear_already_paid_level_awards_zero():
    store = _seed_store(prior_clear=True)
    result, reward = await _run(store, _answers(10))
    assert result["passed"] is True
    assert result["first_clear"] is False
    assert result["tokens_awarded"] == 0
    reward.assert_not_awaited()


@pytest.mark.asyncio
async def test_other_users_clear_does_not_suppress_reward():
    store = _seed_store(prior_clear=True, prior_clear_user="u2")
    result, reward = await _run(store, _answers(10))
    assert result["passed"] is True
    assert result["first_clear"] is True
    assert result["tokens_awarded"] == 50
    reward.assert_awaited_once()


@pytest.mark.asyncio
async def test_below_bar_awards_zero_and_does_not_unlock():
    store = _seed_store()
    result, reward = await _run(store, _answers(7))  # 7/10 — under the 8 bar
    assert result["score"] == 7
    assert result["passed"] is False
    assert result["tokens_awarded"] == 0
    assert result["next_level_unlocked"] is None
    reward.assert_not_awaited()


@pytest.mark.asyncio
async def test_resubmit_same_attempt_replays_without_reawarding():
    store = _seed_store()
    first, reward1 = await _run(store, _answers(10))
    assert first["tokens_awarded"] == 50
    # second submit of the SAME (now graded) attempt → replay, no new award
    fake = _FakeAdmin(store)
    with patch("app.services.upskilling_service.get_supabase_admin", return_value=fake), \
         patch("app.services.upskilling_service.xp_service.get_xp_balance", new=AsyncMock(return_value=1020)), \
         patch("app.services.upskilling_service.xp_service.reward", new=AsyncMock()) as reward2:
        replay = await upskilling_service.submit_set("u1", "att-1", _answers(10), "idem-1")
    assert replay["score"] == 10
    assert replay["passed"] is True
    reward2.assert_not_awaited()


def test_ladder_uses_taxonomy_display_name_and_exposes_all_servable_banks():
    other_skill_id = SKILL_ID + 1
    scenario_skill_id = SKILL_ID + 2
    bank = [
        {
            "id": level * 100 + offset,
            "skill_id": SKILL_ID,
            "skill_key": "machine-learning",
            "level": level,
            "status": "active",
            **_reviewed_fields(level * 100 + offset),
        }
        for level in range(1, 6)
        for offset in range(10)
    ] + [
        {
            "id": 900 + offset,
            "skill_id": other_skill_id,
            "skill_key": "product-strategy",
            "level": 1,
            "status": "active",
            **_reviewed_fields(900 + offset),
        }
        for offset in range(10)
    ] + [
        {
            "id": 1000 + offset,
            "skill_id": scenario_skill_id,
            "skill_key": "communication",
            "level": 1,
            "status": "active",
            **_reviewed_fields(1000 + offset),
        }
        for offset in range(10)
    ]
    store = {
        "skill_questions": bank,
        "skills": [
            {
                "id": SKILL_ID,
                "taxonomy_key": "machine-learning",
                "display_name": "Machine Learning",
            },
            {
                "id": other_skill_id,
                "taxonomy_key": "product-strategy",
                "display_name": "Product Strategy",
            },
            {
                "id": scenario_skill_id,
                "taxonomy_key": "communication",
                "display_name": "Communication",
                "practice_mode": "scenario",
            },
        ],
        "skill_assessed_level": [
            {"user_id": "u1", "skill_id": SKILL_ID, "assessed_level": 1}
        ],
        "user_skills": [
            {"user_id": "u1", "skill_id": SKILL_ID, "matched_level": 4}
        ],
    }

    with patch(
        "app.services.upskilling_service.get_supabase_admin",
        return_value=_FakeAdmin(store),
    ):
        ladder = upskilling_service.list_skills("u1")

    assert ladder == [
        {
            "skill_id": other_skill_id,
            "skill_key": "product-strategy",
            "display_name": "Product Strategy",
            "cleared_level": 0,
            "next_level": 1,
            "assessed_level": 0,
            "on_cv": False,
            "demand": "none",
            "job_count": 0,
            "max_bank_level": 1,
            "locked": False,
        },
        {
            "skill_id": SKILL_ID,
            "skill_key": "machine-learning",
            "display_name": "Machine Learning",
            "cleared_level": 1,
            "next_level": 2,
            "assessed_level": 1,
            "on_cv": True,
            "demand": "none",
            "job_count": 0,
            "max_bank_level": 5,
            "locked": False,
        }
    ]


def test_skill_display_columns_match_checked_in_schema():
    migration = (
        Path(__file__).resolve().parents[2]
        / "database/migrations/20260813180000_skill_practice_mode.sql"
    ).read_text()
    columns = getattr(upskilling_service, "SKILL_DISPLAY_COLUMNS", "")

    assert columns == "id, taxonomy_key, display_name, practice_mode"
    assert "add column if not exists practice_mode text" in migration.lower()


def test_start_set_rejects_scenario_skills_before_reading_a_question_bank():
    store = {
        "skills": [{
            "id": SKILL_ID,
            "taxonomy_key": "Communication",
            "display_name": "Communication",
            "practice_mode": "scenario",
        }],
        "skill_questions": [],
    }

    with patch(
        "app.services.upskilling_service.get_supabase_admin",
        return_value=_FakeAdmin(store),
    ), pytest.raises(HTTPException) as exc:
        upskilling_service.start_set("u1", SKILL_ID, 1)

    assert exc.value.status_code == 409
    assert "five-level" in str(exc.value.detail)


# ── start_gap empty states (Preparations drill) ──────────────────────────────
# A diagnostic surface with nothing to test is EMPTY, not an error: the old 409s
# rendered as "Couldn't load the drill. Try again" in the prep room (Sanofi PM
# job — 0 of 13 skills had a question bank, 2026-07-16).


def _start_gap(store, required):
    fake = _FakeAdmin(store)
    with patch("app.services.upskilling_service.get_supabase_admin", return_value=fake):
        return upskilling_service.start_gap(
            user_id="u1",
            job_id="job-1",
            job_title="Head of PM",
            company="Sanofi",
            required=required,
        )


def test_start_gap_no_gaps_returns_empty_not_409():
    result = _start_gap(
        {"skill_questions": [], "skills": [], "quiz_attempts": []},
        required=[{"skill_key": "sql", "target_level": 2, "user_level": 3, "is_primary": True}],
    )
    assert result["skills"] == []
    assert result["reason"] == "no_gaps"
    assert result["assessment_id"] == ""


def test_start_gap_no_question_bank_returns_empty_not_409():
    store = {"skill_questions": [], "skills": [], "quiz_attempts": []}
    result = _start_gap(
        store,
        required=[
            {"skill_key": "stakeholder-management", "target_level": 3, "user_level": 0, "is_primary": True},
        ],
    )
    assert result["skills"] == []
    assert result["reason"] == "no_bank"
    assert result["assessment_id"] == ""
    # No phantom attempt row written for an empty drill.
    assert store["quiz_attempts"] == []


def test_start_gap_served_carries_no_reason():
    store = {
        "skill_questions": [
            {
                "id": qid,
                "skill_id": SKILL_ID,
                "skill_key": "sql",
                    "status": "active",
                    **_reviewed_fields(qid),
                }
                for qid in range(1, 4)
            ],
            "quiz_attempt_question_snapshots": [],
            "skills": [{"id": SKILL_ID, "taxonomy_key": "sql", "display_name": "SQL"}],
            "quiz_attempts": [],
        }
    result = _start_gap(
        store,
        required=[{"skill_key": "sql", "target_level": 3, "user_level": 1, "is_primary": True}],
    )
    assert result["reason"] is None
    assert result["assessment_id"]
    assert len(result["skills"]) == 1
    assert len(store["quiz_attempts"]) == 1
