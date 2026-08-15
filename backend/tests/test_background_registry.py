"""The Job Runner must be able to run every job the web process can enqueue.

`@background.handler` populates a per-process dict, so "registered" is a
property of whichever process imported the module. Web registered
`onboarding_target_refresh` (via its router) and the Runner did not (its
entrypoint kept a separate hand-written import list). `enqueue`'s guard passed
in web, the Runner logged "no handler — dropping", RQ recorded "Job OK", and
every signup from 2026-07-31 to 2026-08-03 silently lost its Myro Score.

These tests encode the two invariants that would have caught it.
"""

from __future__ import annotations

import importlib
import pkgutil

import pytest

import app.services
from app.services.background import registry
from app.services.background.dispatch import UnregisteredJobTypeError, _invoke


def _import_every_service_module() -> None:
    """Import all of app.services so any stray @background.handler registers."""
    for module in pkgutil.walk_packages(app.services.__path__, "app.services."):
        try:
            importlib.import_module(module.name)
        except Exception:  # pragma: no cover — an unimportable module is its own test's problem
            continue


def test_registry_covers_every_registered_handler() -> None:
    """No module outside the registry may own a handler.

    Falsified by deleting a line from `background/registry.py`: that module's
    job types then appear only after the walk, and this fails naming them.
    """
    declared = registry.registered_job_types()
    _import_every_service_module()
    missing = registry.registered_job_types() - declared
    assert not missing, (
        "these job types register outside app/services/background/registry.py, so the "
        f"Job Runner cannot run them: {sorted(missing)}. Add their module to the registry."
    )


def test_registry_includes_the_onboarding_handlers() -> None:
    """The two that were actually missing — named so a re-drop is unambiguous."""
    declared = registry.registered_job_types()
    assert "onboarding_target_refresh" in declared  # score after target confirm
    assert "provisional_baseline_score" in declared  # score during skill-review idle


def test_registry_includes_the_skill_floor_handler() -> None:
    assert "skill_floor_drain" in registry.registered_job_types()


@pytest.mark.asyncio
async def test_unknown_job_type_fails_loudly() -> None:
    """A dropped job must reach RQ's failed registry, never report success."""
    with pytest.raises(UnregisteredJobTypeError):
        await _invoke("no_such_job_type", {}, allow_retry=True)
