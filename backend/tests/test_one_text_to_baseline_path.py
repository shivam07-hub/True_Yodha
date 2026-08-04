"""Describing your experience takes the same path as uploading a CV.

There used to be two. `onboarding_preview` ran its own `cv_upload_jobs` row, its
own phases, its own failure codes and its own `patch_state` — shadowing the Upload
Guarantee (idempotency, refund, orphan sweep) without inheriting it — and ended on
`estimate_min`/`estimate_max`, a score RANGE beside the canonical Myro Score that
OQ4 declares the single source of truth.

`cv_workflow.start_cv_upload_job_from_text` already existed and `/baseline/approve`
already used it. Measured before removing: `preview_payload` was non-null in 0 of
80 onboarding rows over 90 days, and 0 of the 11 since the CTA was promoted to a
real button on 2026-08-02 — so nothing was riding the second pipeline.

Falsify by reintroducing a `/onboarding/profile-preview` route or a second
`analysis_kind="profile_preview"` writer.
"""

from __future__ import annotations

from pathlib import Path

from app.main import app

_BACKEND = Path(__file__).resolve().parents[1]


def test_there_is_no_second_text_to_baseline_endpoint() -> None:
    routes = {getattr(route, "path", "") for route in app.routes}
    assert "/onboarding/profile-preview" not in routes
    # The one that survived, and the one the describe box now posts to.
    assert "/onboarding/baseline/approve" in routes


def test_the_parallel_preview_pipeline_is_gone() -> None:
    assert not (_BACKEND / "app/services/onboarding_preview.py").exists()

    sources = list((_BACKEND / "app").rglob("*.py"))
    offenders = [
        path.relative_to(_BACKEND)
        for path in sources
        if "onboarding_profile_preview" in path.read_text()
    ]
    assert offenders == [], f"a second preview pipeline came back in {offenders}"


def test_no_second_scoring_model_for_a_described_profile() -> None:
    """`estimate_min`/`estimate_max` was a score range produced by a different
    model than `project_score`. A description now yields a real Myro Score."""
    sources = list((_BACKEND / "app").rglob("*.py"))
    offenders = [
        path.relative_to(_BACKEND)
        for path in sources
        if "estimate_min" in path.read_text()
    ]
    assert offenders == [], f"the estimate scoring model is back in {offenders}"
