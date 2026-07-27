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
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field

import httpx

# The origin a browser really sends. For dev that is a Vercel preview host,
# whose deployment hash changes on every push — the exact value is unknowable
# here on purpose, which is the whole reason the dev tier matches a pattern.
_PREFLIGHT_PATH = "/users/me"
_TIMEOUT = 20.0


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


def _preflight(client: httpx.Client, api: str, origin: str) -> int:
    response = client.options(
        f"{api}{_PREFLIGHT_PATH}",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    return response.status_code


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
    args = parser.parse_args()
    tiers = args.tier or sorted(CONTRACTS)

    failures: list[str] = []
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
