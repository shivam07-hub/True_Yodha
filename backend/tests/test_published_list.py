"""The /market list shows what the career-ops judge kept."""
from __future__ import annotations

from app.services.matching.published_list import (
    cause_line,
    larger_cut,
    notice,
    order_by_score,
    skill_lines,
    worth_showing,
)


def test_a_job_under_the_bar_is_not_on_the_list() -> None:
    assert worth_showing(3.4, "Skip") is False
    assert worth_showing(3.5, "Negotiate") is True
    assert worth_showing(4.2, "Apply") is True
    assert worth_showing(4.8, "Skip") is False
    assert worth_showing(None, "Apply") is False


def test_the_list_is_the_judge_s_order() -> None:
    rows = order_by_score([
        {"job_id": "b", "overall_score": 3.6},
        {"job_id": "a", "overall_score": 4.4},
        {"job_id": "c", "overall_score": 4.4},
    ])
    assert [row["job_id"] for row in rows] == ["a", "c", "b"]


def test_eight_from_a_small_pool_names_the_aspirations() -> None:
    assert larger_cut(pool=12, cleared=8) == "aspirations"


def test_eight_from_a_large_pool_names_the_skills() -> None:
    assert larger_cut(pool=200, cleared=8) == "skills"


def test_a_full_list_of_good_jobs_needs_no_cause() -> None:
    assert larger_cut(pool=80, cleared=40) is None


def test_skill_lines_come_from_the_skipped_concerns() -> None:
    lines = skill_lines([
        {"concerns": ["SQL", "SQL", "stakeholder updates"]},
        {"concerns": ["a portfolio piece"]},
    ])
    assert lines == ["SQL", "stakeholder updates", "a portfolio piece"]


def test_the_notice_while_reading_is_not_the_count() -> None:
    text = notice(
        reading=True,
        cause="skills", skills=["SQL"], cv_replaced=False,
    )
    assert text is None


def test_a_finished_short_list_says_which_cut_was_larger() -> None:
    text = notice(
        reading=False,
        cause="skills", skills=["SQL", "a portfolio piece"], cv_replaced=False,
    )
    assert text == cause_line("skills", ["SQL", "a portfolio piece"])


def test_a_replaced_cv_is_named_while_the_new_one_is_read() -> None:
    text = notice(
        reading=True,
        cause=None, skills=[], cv_replaced=True,
    )
    assert text == "These matches are for the CV you replaced. Reading the one you saved."
    assert "Read 0" not in (text or "")


def test_a_card_that_omits_listing_time_does_not_validate() -> None:
    """A default of `is_stale=False` let a builder that forgot the field
    claim every listing was confirmed open. The card must say."""
    import pytest
    from pydantic import ValidationError

    from app.schemas.jobs import JobFeedItem

    with pytest.raises(ValidationError):
        JobFeedItem(job_id="j1", job_title="t", company_name=None, job_description=None)


def test_a_card_says_when_its_pay_band_sits_under_the_floor() -> None:
    """A floor never hides a card. It is said on the card instead."""
    from app.schemas.jobs import JobFeedItem
    from app.services.matching.published_list import _card

    row = {
        "job_id": "j1",
        "overall_score": 4.2,
        "recommendation": "Apply",
        "ctc_low_lpa": 24.0,
        "ctc_high_lpa": 32.0,
        "ctc_basis": "estimated",
        "jobs": {"job_title": "Account Executive", "company_name": "Acme", "is_active": True},
    }
    card = JobFeedItem(**_card(row, 35.0))
    assert (card.ctc_low_lpa, card.ctc_high_lpa, card.ctc_basis) == (24.0, 32.0, "estimated")
    assert card.pay_below_floor is True
    # No floor stated: nothing to be under.
    assert JobFeedItem(**_card(row, None)).pay_below_floor is None


# ── Verdict Currency (#55 S1): a returning person's list does not vanish ─────

_PROFILE = {
    "target_role_title": "Data Analyst",
    "target_seniority": "mid",
    "target_location": "Bengaluru",
}


def _keys(baseline: int, profile: dict | None = None) -> tuple[str, str]:
    from app.services import onboarding_service

    prof = {**(profile or _PROFILE), "baseline_version_id": baseline}
    return onboarding_service.eval_context_key(prof), onboarding_service.context_key(prof)


def _row(job_id: str, score: float, *, eval_hash: str | None, direction: str | None, baseline: int = 7) -> dict:
    return {
        "job_id": job_id,
        "overall_score": score,
        "recommendation": "Apply",
        "eval_context_hash": eval_hash,
        "target_context_hash": direction,
        "baseline_version_id": baseline,
        "jobs": {"job_title": job_id, "is_active": True},
    }


class _Repo:
    def __init__(self, stack: list[dict], *, baseline: int = 7, profile: dict | None = None) -> None:
        self._stack = stack
        self._baseline = baseline
        self._profile = profile or _PROFILE

    def get_user_profile_targeting(self, user_id: str) -> dict:
        return dict(self._profile)

    def get_latest_baseline_id(self, user_id: str) -> int:
        return self._baseline

    def get_user_match_stack(self, user_id: str) -> list[dict]:
        return self._stack


def test_a_stale_verdict_is_shown_after_every_current_one() -> None:
    """A prompt bump or a distilled fact used to hide the whole list. A stale
    verdict now shows, marked, and never outranks a current one."""
    from app.services.matching.published_list import assemble

    now, direction = _keys(7)
    cards, judgment = assemble(_Repo([
        _row("stale-high", 4.8, eval_hash="an-older-prompt", direction=direction),
        _row("current-low", 3.6, eval_hash=now, direction=direction),
        _row("predates-the-key", 4.0, eval_hash=None, direction=direction),
    ]), "u1")

    assert [c["job_id"] for c in cards] == ["current-low", "stale-high", "predates-the-key"]
    assert [c["rereading"] for c in cards] == [False, True, True]
    assert judgment["cv_replaced"] is False


def test_another_direction_s_verdict_is_not_shown() -> None:
    from app.services.matching.published_list import assemble

    _, left_direction = _keys(7, {**_PROFILE, "target_role_title": "Product Manager"})
    cards, judgment = assemble(_Repo([
        _row("old-direction", 4.6, eval_hash="whatever", direction=left_direction),
    ]), "u1")

    assert cards == []
    assert judgment["cv_replaced"] is False


def test_a_replaced_cv_still_shows_the_old_list_while_the_new_one_is_read() -> None:
    from app.services.matching.published_list import assemble

    old_eval, old_direction = _keys(6)
    cards, judgment = assemble(_Repo([
        _row("from-the-old-cv", 4.2, eval_hash=old_eval, direction=old_direction, baseline=6),
    ], baseline=7), "u1")

    assert [c["job_id"] for c in cards] == ["from-the-old-cv"]
    assert cards[0]["rereading"] is False
    assert judgment["cv_replaced"] is True


def test_a_prompt_version_bump_leaves_the_card_count_unchanged(monkeypatch) -> None:
    """ARCHITECTURE_RETURN_LOOP.md 'Done means': a bump re-reads, it does not empty."""
    from app.services import llm_ranker
    from app.services.matching.published_list import assemble

    now, direction = _keys(7)
    repo = _Repo([
        _row("a", 4.4, eval_hash=now, direction=direction),
        _row("b", 3.9, eval_hash=now, direction=direction),
    ])
    before, _ = assemble(repo, "u1")
    monkeypatch.setattr(llm_ranker, "PROMPT_VERSION", llm_ranker.PROMPT_VERSION + "-next")
    after, _ = assemble(repo, "u1")

    assert len(before) == len(after) == 2
    assert all(c["rereading"] for c in after)


# ── List Reading (ADR-0027): a full list stops reading and offers more ──────

class _PileRepo(_Repo):
    def __init__(self, stack: list[dict], pool: list[str]) -> None:
        super().__init__(stack, profile={**_PROFILE, "target_roles": ["Data Analytics"]})
        self._pool = pool

    def get_candidate_job_ids_for_roles(self, roles, **_kw) -> list[str]:
        return list(self._pool)


def _pile(cleared: int, unread: int) -> _PileRepo:
    now, direction = _keys(7, {**_PROFILE, "target_roles": ["Data Analytics"]})
    stack = [_row(f"good-{i}", 4.2, eval_hash=now, direction=direction) for i in range(cleared)]
    pool = [f"good-{i}" for i in range(cleared)] + [f"unread-{i}" for i in range(unread)]
    return _PileRepo(stack, pool)


def test_a_full_list_stops_reading_and_offers_more(monkeypatch) -> None:
    from app.services.matching import list_reading
    from app.services.matching.published_list import assemble

    monkeypatch.setattr(list_reading.settings, "redis_url", "")
    list_reading._LOCAL.clear()
    cards, judgment = assemble(_pile(cleared=40, unread=300), "u1")
    assert len(cards) == 40
    assert judgment["reading"] is False
    assert judgment["can_read_more"] is True
    assert judgment["pending"] == 300


def test_a_list_short_of_forty_keeps_reading_and_offers_nothing(monkeypatch) -> None:
    from app.services.matching import list_reading
    from app.services.matching.published_list import assemble

    monkeypatch.setattr(list_reading.settings, "redis_url", "")
    list_reading._LOCAL.clear()
    _, judgment = assemble(_pile(cleared=12, unread=300), "u1")
    assert judgment["reading"] is True
    assert judgment["can_read_more"] is False


def test_after_read_more_the_full_list_reads_again(monkeypatch) -> None:
    from app.services import onboarding_service
    from app.services.matching import list_reading
    from app.services.matching.published_list import assemble

    monkeypatch.setattr(list_reading.settings, "redis_url", "")
    list_reading._LOCAL.clear()
    ctx = onboarding_service.eval_context_key({**_PROFILE, "target_roles": ["Data Analytics"], "baseline_version_id": 7})
    list_reading.ask_for_more("u1", ctx, cleared=40)
    _, judgment = assemble(_pile(cleared=40, unread=300), "u1")
    assert judgment["reading"] is True and judgment["can_read_more"] is False


def test_nothing_left_to_read_offers_nothing(monkeypatch) -> None:
    from app.services.matching import list_reading
    from app.services.matching.published_list import assemble

    monkeypatch.setattr(list_reading.settings, "redis_url", "")
    list_reading._LOCAL.clear()
    _, judgment = assemble(_pile(cleared=40, unread=0), "u1")
    assert judgment["reading"] is False and judgment["can_read_more"] is False
