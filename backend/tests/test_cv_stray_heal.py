"""Next-visit heal for CV skills extracted from employer headers."""

from __future__ import annotations

from app.services import cv_stray_heal

_CV = """\
EXPERIENCE
Salesforce
Account Executive
Jan 2023 – Present
- Closed 12 enterprise deals
SKILLS
Python
"""


def test_enqueue_if_behind_enqueues_when_a_header_skill_is_present(monkeypatch) -> None:
    jobs: list[tuple[str, str]] = []
    monkeypatch.setattr(
        cv_stray_heal,
        "_load",
        lambda _db, _uid: (
            _CV,
            [
                {
                    "skill_id": 1,
                    "taxonomy_key": "Salesforce",
                    "evidence_text": "Salesforce",
                    "source": "cv",
                },
                {
                    "skill_id": 2,
                    "taxonomy_key": "Python (Programming Language)",
                    "evidence_text": "Python",
                    "source": "cv",
                },
            ],
        ),
    )
    monkeypatch.setattr("app.database.get_supabase_admin", lambda: object())
    monkeypatch.setattr(
        cv_stray_heal.background,
        "enqueue",
        lambda lane, job_type, payload: jobs.append((lane, job_type)),
    )

    assert cv_stray_heal.enqueue_if_behind("u1") is True
    assert jobs == [(cv_stray_heal.background.LANE_FAST, "stray_skill_heal")]


def test_enqueue_if_behind_is_a_no_op_when_every_skill_is_honest(monkeypatch) -> None:
    monkeypatch.setattr(
        cv_stray_heal,
        "_load",
        lambda _db, _uid: (
            _CV,
            [
                {
                    "skill_id": 2,
                    "taxonomy_key": "Python (Programming Language)",
                    "evidence_text": "Python",
                    "source": "cv",
                },
            ],
        ),
    )
    monkeypatch.setattr("app.database.get_supabase_admin", lambda: object())
    monkeypatch.setattr(
        cv_stray_heal.background,
        "enqueue",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("must not enqueue")),
    )

    assert cv_stray_heal.enqueue_if_behind("u1") is False
