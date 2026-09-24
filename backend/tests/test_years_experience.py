"""Years of experience: read from the CV, correctable, never overwritten after.

The number retrieval matches against an employer's "3+ years". The band cannot
answer it — `mid` admits entry AND mid alike — so it is its own field, and the
one rule that matters is that her correction outlives every later re-parse.
"""
from __future__ import annotations

from app.services.experience_years import seniority_from_cv


def _baseline(*date_ranges: str) -> dict:
    return {
        "cv_structured": {
            "experience": [{"role": "Engineer", "dates": d} for d in date_ranges],
        }
    }


def test_years_sum_each_role_and_never_span_a_career_break():
    """The CV that started this: 2.5 years at one employer, 7 years running a
    business, then 8 months back in engineering. Spanning first-to-last reads
    fifteen years and would match her against senior roles forever."""
    suggestion = seniority_from_cv(_baseline(
        "Aug 2026 – Present", "Jan 2026 – Aug 2026", "Jan 2016 – Jul 2018",
    ))

    assert suggestion["years"] == 3
    assert suggestion["value"] == "mid"
    assert suggestion["source"] == "experience_years"


def test_an_unreadable_cv_yields_no_number_rather_than_zero():
    """`None` is "we could not read it" and must never be matched as zero — a
    zero would make every "2+ years" listing ineligible."""
    suggestion = seniority_from_cv(_baseline("sometime last year"))

    assert suggestion.get("years") is None
    assert suggestion["needs_choice"] is True


def test_a_correction_survives_the_next_cv_parse(monkeypatch):
    """CEO decision 2026-09-23: read the CV, let her correct it. A correction
    she made is marked `user`, and the parse path must leave it alone."""
    from app.services import onboarding_service

    written: list[dict] = []

    class _Repo:
        def get_profile(self, _uid):
            return {"target_seniority": "mid", "years_experience": 3.2,
                    "years_experience_source": "user"}

    class _Scores:
        def mirror_score_exists(self, _uid):
            return False

    baseline = _baseline("Jan 2016 – Jul 2018")
    baseline["skills_detected"] = [{"name": "Python"}]

    class _CVs:
        def find(self, _vid, _uid):
            return baseline

    monkeypatch.setattr(onboarding_service, "UsersRepository", lambda _db: _Repo())
    monkeypatch.setattr(onboarding_service, "ScoresRepository", lambda _db: _Scores())
    monkeypatch.setattr(onboarding_service, "CVVersionsRepository", lambda _db: _CVs())
    monkeypatch.setattr(onboarding_service.scoring, "record_cv_score", lambda *a, **k: None)

    import app.services.targeting_write as targeting_write
    monkeypatch.setattr(
        targeting_write, "commit",
        lambda _repo, _uid, patch: written.append(patch),
    )

    onboarding_service.seed_provisional_baseline_score(None, "u1", 599)

    assert not any("years_experience" in p for p in written), (
        "a re-parse overwrote a number the user had corrected"
    )


def test_the_parse_path_stores_what_it_read_when_she_has_not_corrected_it(monkeypatch):
    from app.services import onboarding_service

    written: list[dict] = []

    class _Repo:
        def get_profile(self, _uid):
            return {"target_seniority": "mid"}

    class _Scores:
        def mirror_score_exists(self, _uid):
            return False

    baseline = _baseline("Jan 2016 – Jul 2018")
    baseline["skills_detected"] = [{"name": "Python"}]

    class _CVs:
        def find(self, _vid, _uid):
            return baseline

    monkeypatch.setattr(onboarding_service, "UsersRepository", lambda _db: _Repo())
    monkeypatch.setattr(onboarding_service, "ScoresRepository", lambda _db: _Scores())
    monkeypatch.setattr(onboarding_service, "CVVersionsRepository", lambda _db: _CVs())
    monkeypatch.setattr(onboarding_service.scoring, "record_cv_score", lambda *a, **k: None)

    import app.services.targeting_write as targeting_write
    monkeypatch.setattr(
        targeting_write, "commit",
        lambda _repo, _uid, patch: written.append(patch),
    )

    onboarding_service.seed_provisional_baseline_score(None, "u1", 599)

    # Jan 2016 to the END of Jul 2018 is ~2.6 years, which rounds to 3 — the
    # parser counts to the last day of the closing month, not its first.
    patch = next(p for p in written if "years_experience" in p)
    assert patch["years_experience"] == 3
    assert patch["years_experience_source"] == "cv"
