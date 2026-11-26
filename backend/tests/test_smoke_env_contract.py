"""The contract smoke tests the build a push deployed, never the one it replaces.

On 2026-11-25 a fixed 90 s sleep put the probes into Railway's cutover, while
the new prod container was up but its server was not yet listening: four 502s
and a red cross on `main` for a healthy deploy.
"""

from __future__ import annotations

from scripts.smoke_env_contract import tier_deployed_by, wait_for_version

SHA = "404b7c4e31a9297365a7fb2906a2f25038957bb8"


class Clock:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def test_it_waits_through_the_cutover_until_the_pushed_build_answers() -> None:
    clock = Clock()
    # Old build, then the cutover (no answer), then the new build.
    reads = iter(["7c7a8f2", "7c7a8f2", None, "404b7c4"])
    missed = wait_for_version(
        lambda: next(reads),
        SHA,
        deadline_seconds=600,
        poll_seconds=10,
        sleep=clock.sleep,
        clock=clock.monotonic,
    )
    assert missed is None
    assert clock.sleeps == [10, 10, 10]


def test_a_deploy_that_never_lands_names_what_is_still_live() -> None:
    clock = Clock()
    missed = wait_for_version(
        lambda: "7c7a8f2",
        SHA,
        deadline_seconds=60,
        poll_seconds=10,
        sleep=clock.sleep,
        clock=clock.monotonic,
    )
    assert missed == "7c7a8f2"
    assert clock.now <= 60


def test_a_tier_that_never_answers_says_so() -> None:
    clock = Clock()
    missed = wait_for_version(
        lambda: None,
        SHA,
        deadline_seconds=30,
        poll_seconds=10,
        sleep=clock.sleep,
        clock=clock.monotonic,
    )
    assert missed == "no answer"


def test_each_branch_redeploys_its_own_tier() -> None:
    assert tier_deployed_by("main") == "prod"
    assert tier_deployed_by("Develop") == "dev"
    assert tier_deployed_by("feature/x") is None
