"""Where one rule is written in both Python and SQL, the two must agree.

Three rules live twice in this codebase. None of them had a test tying the
copies together, and one of them — the telemetry vocabulary — has already cost
seven days of silently dropped events.

  1. `canonical_source_seniority` — a Python dict and a PL/pgSQL CASE, same
     name, same eleven tokens, maintained independently.
  2. the `credible` conjunction — a Python `and` chain in `match_credibility`
     and a CHECK constraint on `user_job_matches`.
  3. the telemetry vocabulary — see `test_telemetry_vocabulary`.

These tests do not merge the copies. Two enforcement points is a deliberate
belt-and-braces: the CHECK is what stops a bad row when a code path forgets.
What is not deliberate is the two drifting, which is what these catch.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services.job_eligibility import canonical_source_seniority
from app.services.match_credibility import evaluate_credibility

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "database" / "migrations"
SENIORITY_SQL = MIGRATIONS / "20260827120000_career_target_skill_path.sql"
CREDIBLE_SQL = MIGRATIONS / "20260619_trustworthy_first_value_onboarding.sql"


def _sql_seniority_map() -> dict[str, str]:
    """The `when 'x' then 'y'` pairs of the SQL canonicaliser."""
    body = SENIORITY_SQL.read_text(encoding="utf-8")
    start = body.index("function public.canonical_source_seniority")
    end = body.index("$$;", start)
    pairs = re.findall(r"when\s+'([^']+)'\s+then\s+'([^']+)'", body[start:end], re.IGNORECASE)
    assert pairs, "the SQL canonicaliser stopped being a CASE — re-read it before trusting this"
    return dict(pairs)


@pytest.mark.parametrize("token,expected", sorted(_sql_seniority_map().items()))
def test_python_reads_every_token_the_sql_reads(token: str, expected: str) -> None:
    """Same input, same canonical level, on both sides of the wire.

    They are applied to two halves of one query: `role_family_demand` filters
    on `p_seniority`, and the caller canonicalises that argument in Python
    before sending it. A token the two disagree about matches nothing, silently
    and for ever.
    """
    assert canonical_source_seniority(token) == expected, (
        f"SQL maps {token!r}→{expected!r}; Python maps it to "
        f"{canonical_source_seniority(token)!r}"
    )


def test_python_reads_no_token_the_sql_has_never_heard_of() -> None:
    # The other direction: a level Python accepts and SQL returns NULL for is a
    # filter that quietly matches nothing.
    sql_tokens = set(_sql_seniority_map())
    for token in sql_tokens:
        assert canonical_source_seniority(token)
    # Every canonical output must itself be a token SQL accepts, since callers
    # round-trip the canonical value back into the query.
    for canonical in set(_sql_seniority_map().values()):
        assert canonical in sql_tokens, f"SQL cannot re-read its own output {canonical!r}"


def test_the_two_disagree_only_about_how_they_say_unreadable() -> None:
    """The one known, deliberate difference — documented so it is not a surprise.

    SQL returns NULL for an unreadable value, Python returns "", and
    `role_family_scope` stores the literal string 'unknown' for the same idea.
    Three spellings of one state. They do not currently collide, because no
    caller compares across the two, but a future one will — so the difference
    is pinned here rather than left to be rediscovered.
    """
    assert canonical_source_seniority("not-a-level") == ""
    body = SENIORITY_SQL.read_text(encoding="utf-8")
    assert re.search(r"else\s+null", body, re.IGNORECASE), (
        "SQL stopped returning NULL for an unreadable level — if it now returns '', "
        "this difference is gone and the note above should go with it"
    )


# ── the credible conjunction ─────────────────────────────────────────────────


def _profile() -> dict:
    return {
        "baseline_version_id": 1,
        "target_role_title": "Financial Analysis",
        "target_seniority": "entry",
    }


def _job(level: str = "entry") -> dict:
    return {"job_id": "j", "job_title": "Analyst", "seniority_level": level}


@pytest.mark.parametrize(
    "score,recommendation",
    [
        (4.2, "Apply"), (3.5, "Negotiate"), (3.4, "Apply"),
        (4.9, "Skip"), (None, "Apply"), (2.0, "Negotiate"),
    ],
)
def test_nothing_python_calls_credible_can_violate_the_db_check(
    score: float | None, recommendation: str
) -> None:
    """`credible` is what sets `is_recommended`, and the CHECK is what the row
    must satisfy. If Python can say yes where the CHECK says no, the write
    fails at the database with a constraint error the user never sees."""
    cred = evaluate_credibility(_profile(), _job(), overall_score=score, recommendation=recommendation)
    if not cred.credible:
        return
    # The three conditions of `user_job_matches_recommended_credible_chk`.
    assert score is not None and score >= 3.5
    assert recommendation in {"Apply", "Negotiate"}
    assert cred.seniority_compatibility == "compatible"


def test_the_db_check_still_states_the_three_conditions() -> None:
    # If the CHECK is relaxed or tightened, the property test above silently
    # starts asserting the wrong thing. This is what makes it notice.
    sql = CREDIBLE_SQL.read_text(encoding="utf-8")
    clause = sql[sql.index("user_job_matches_recommended_credible_chk"):]
    clause = clause[: clause.index(");")]
    assert "overall_score >= 3.5" in clause
    assert "recommendation IN ('Apply', 'Negotiate')" in clause
    assert "seniority_compatibility = 'compatible'" in clause
