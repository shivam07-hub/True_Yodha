"""The sequential-depth half of the read contract (ARCHITECTURE_READ_PATH.md §17).

test_read_contract.py guards fan-out WIDTH, and only for routes that call
run_concurrently. /career-skill-path went to production with nineteen
sequential reads and nothing saw it. These tests cover the counter that does.
"""
from __future__ import annotations

from contextvars import copy_context

from app.services import read_budget
from app.services.concurrent_reads import run_concurrently


def test_reads_outside_a_request_are_not_counted() -> None:
    # Workers, startup checks and scripts have no counter and must not blow up.
    read_budget.record_read()
    assert read_budget.current_count() == 0


def test_a_request_counts_its_own_reads() -> None:
    token = read_budget.begin()
    try:
        for _ in range(4):
            read_budget.record_read()
        assert read_budget.current_count() == 4
    finally:
        read_budget.end(token)
    assert read_budget.current_count() == 0


def test_fanout_reads_reach_the_callers_tally() -> None:
    """The whole reason the counter is a shared object, not a ContextVar int.

    run_concurrently runs sections in a COPIED context. A value written inside
    a copied context is invisible to the parent, so a plain ContextVar[int]
    would count zero here — silently excluding exactly the fan-out reads the
    read contract is about.
    """
    token = read_budget.begin()
    try:
        run_concurrently(
            {
                "a": read_budget.record_read,
                "b": read_budget.record_read,
                "c": read_budget.record_read,
            },
            label="test.fanout",
        )
        assert read_budget.current_count() == 3
    finally:
        read_budget.end(token)


def test_a_copied_context_shares_the_same_tally() -> None:
    token = read_budget.begin()
    try:
        copy_context().run(read_budget.record_read)
        assert read_budget.current_count() == 1
    finally:
        read_budget.end(token)


def test_the_budget_sits_above_the_worst_legitimate_shape() -> None:
    # /career-skill-path is 11 reads after f138a5b9; nineteen was the bug. A
    # budget below the former nags, one above the latter cannot catch it.
    assert 11 < read_budget.READ_BUDGET_PER_REQUEST < 19
