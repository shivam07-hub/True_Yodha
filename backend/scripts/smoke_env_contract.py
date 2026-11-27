"""Assert each deployed tier can actually serve its own frontend.

The 2026-07-27 dev outage was invisible from every angle we watch: the service
was "Online", `/health` was 200, and the deploy log showed a clean boot. What it
could not do was answer a CORS preflight from the Develop frontend, so every
authenticated call failed in the browser and the app rendered an empty shell.

Nothing in CI asked the one question that mattered: *can the frontend of this
tier talk to the backend of this tier?* This script asks it from outside, the
way a browser does, for both tiers — and asks the inverse too, so a passing run
also proves the allowlist is still a boundary and not a wildcard.

Usage:
    python -m scripts.smoke_env_contract            # both tiers
    python -m scripts.smoke_env_contract --tier dev
    python -m scripts.smoke_env_contract --branch main --sha <pushed sha>

After a push, `--branch` and `--sha` make it wait until the tier that branch
deploys serves that commit before asking anything. A fixed sleep landed the
probes in Railway's cutover on 2026-11-25 (prod has no healthcheck, so traffic
reached the new container ~2 s before its server listened): four 502s and a red
`main` for a healthy deploy. Waiting on the version tests the new build, never
the old one or the gap between them.
"""

from __future__ import annotations

import argparse
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass, field

import httpx

# The origin a browser really sends. For dev that is a Vercel preview host,
# whose deployment hash changes on every push — the exact value is unknowable
# here on purpose, which is the whole reason the dev tier matches a pattern.
_PREFLIGHT_PATH = "/users/me"
# Generous: the dev container is small and cold connects there measured 5-8s
# right after a redeploy, which is exactly when CI runs this.
_TIMEOUT = 30.0
_TRANSPORT_ATTEMPTS = 3
_RETRY_SECONDS = 5.0
_STATUS_PATH = "/v1/status"
# A prod build took 1m40s from push to live on 2026-11-25; ten minutes covers a
# slow build without letting a deploy that never lands pass as "still waiting".
_DEPLOY_WAIT_SECONDS = 600.0
_POLL_SECONDS = 10.0
# Railway builds `main` into prod and `Develop` into dev (INFRA.md).
_TIER_FOR_BRANCH = {"main": "prod", "Develop": "dev"}


@dataclass(frozen=True)
class TierContract:
    name: str
    api: str
    allowed: tuple[str, ...]
    rejected: tuple[str, ...] = field(
        default=(
            "https://evil.example",
            "https://himyro.com.evil.example",
        )
    )


CONTRACTS = {
    "dev": TierContract(
        name="dev",
        api="https://truemirror.up.railway.app",
        allowed=(
            "https://truemirror-git-develop-shivam07-hub.vercel.app",
            "https://truemirror-k3f9xq2ab-myro.vercel.app",
            "http://localhost:3000",
        ),
    ),
    "prod": TierContract(
        name="prod",
        api="https://api.himyro.com",
        allowed=(
            "https://himyro.com",
            "https://www.himyro.com",
        ),
        # Production must reject preview origins outright: a preview build is
        # unreviewed code and has no business calling the live API.
        rejected=(
            "https://evil.example",
            "https://truemirror-k3f9xq2ab-myro.vercel.app",
        ),
    ),
}


def tier_deployed_by(branch: str) -> str | None:
    return _TIER_FOR_BRANCH.get(branch)


def wait_for_version(
    read_version: Callable[[], str | None],
    sha: str,
    *,
    deadline_seconds: float,
    poll_seconds: float,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> str | None:
    """Poll until the tier serves `sha`. None when it does; otherwise the
    version still live when the deadline passed, or "no answer"."""
    wanted = sha[:7]
    last = "no answer"
    start = clock()
    while True:
        version = read_version()
        if version == wanted:
            return None
        if version is not None:
            last = version
        if clock() - start + poll_seconds > deadline_seconds:
            return last
        sleep(poll_seconds)


def _read_version(client: httpx.Client, api: str) -> str | None:
    """The commit a tier is serving, or None while it cannot say (mid-cutover)."""
    try:
        response = client.get(f"{api}{_STATUS_PATH}")
    except httpx.TransportError:
        return None
    if response.status_code != 200:
        return None
    return response.json().get("version")


def _preflight(client: httpx.Client, api: str, origin: str) -> int:
    """Preflight `origin` against `api`, retrying transport failures.

    This runs moments after a deploy, so the first request can land on a
    container that is still warming and time out. A cold start is not a broken
    contract — only a transport failure that survives every attempt is, and that
    is reported as 0 so it fails loudly rather than passing by omission.
    """
    last_error: Exception | None = None
    for attempt in range(_TRANSPORT_ATTEMPTS):
        try:
            response = client.options(
                f"{api}{_PREFLIGHT_PATH}",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "GET",
                    "Access-Control-Request-Headers": "authorization",
                },
            )
        except httpx.TransportError as exc:
            last_error = exc
            if attempt < _TRANSPORT_ATTEMPTS - 1:
                time.sleep(_RETRY_SECONDS * (attempt + 1))
            continue
        return response.status_code
    print(f"  [warn] {origin}: transport failed {_TRANSPORT_ATTEMPTS}x ({last_error})")
    return 0


def check(contract: TierContract) -> list[str]:
    failures: list[str] = []
    with httpx.Client(timeout=_TIMEOUT, follow_redirects=False) as client:
        for origin in contract.allowed:
            status = _preflight(client, contract.api, origin)
            verdict = "ok" if status == 200 else "FAIL"
            print(f"  [{verdict}] {contract.name} allows {origin} -> {status}")
            if status != 200:
                failures.append(
                    f"{contract.name}: {origin} should be allowed, got {status}"
                )
        for origin in contract.rejected:
            status = _preflight(client, contract.api, origin)
            verdict = "ok" if status == 400 else "FAIL"
            print(f"  [{verdict}] {contract.name} rejects {origin} -> {status}")
            if status != 400:
                failures.append(
                    f"{contract.name}: {origin} should be rejected, got {status}"
                )
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tier", choices=sorted(CONTRACTS), action="append")
    parser.add_argument("--branch", help="the branch a push landed on")
    parser.add_argument("--sha", help="the commit that push deployed")
    args = parser.parse_args()
    if (args.branch is None) != (args.sha is None):
        parser.error("--branch and --sha go together")
    tiers = args.tier or sorted(CONTRACTS)

    failures: list[str] = []
    deployed = tier_deployed_by(args.branch) if args.branch else None
    if deployed is not None:
        contract = CONTRACTS[deployed]
        print(f"waiting for {deployed} to serve {args.sha[:7]}")
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=False) as client:
            missed = wait_for_version(
                lambda: _read_version(client, contract.api),
                args.sha,
                deadline_seconds=_DEPLOY_WAIT_SECONDS,
                poll_seconds=_POLL_SECONDS,
            )
        if missed is not None:
            failures.append(
                f"{deployed}: still serving {missed} {_DEPLOY_WAIT_SECONDS:.0f}s "
                f"after the push of {args.sha[:7]}; the deploy did not land"
            )
    for tier in tiers:
        contract = CONTRACTS[tier]
        print(f"{contract.name} -> {contract.api}")
        failures.extend(check(contract))

    if failures:
        print("\nenvironment contract broken:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("\nenvironment contract holds for: " + ", ".join(tiers))
    return 0


if __name__ == "__main__":
    sys.exit(main())
