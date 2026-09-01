"""Load/store the Tailor with Mentor draft in job_deepenings.

Two on-disk shapes, one Interface:

- bare proposal JSON — what a weave RUN has always written
- envelope with ``proposal``, ``applied_version_id``, ``accepted_roles``,
  ``decided_roles`` — what each Keep/Take writes so a landed line survives
  abort (Google Docs), without a second table

A fresh RUN writes the bare shape again and clears Accept progress.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class WeaveCache:
    proposal: dict[str, Any]
    applied_version_id: int | None = None
    accepted_roles: tuple[int, ...] = ()
    decided_roles: tuple[int, ...] = ()


def _ints(value: Any) -> tuple[int, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(i for i in value if isinstance(i, int))


def load(raw: str | None) -> WeaveCache | None:
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    inner = data.get("proposal")
    if isinstance(inner, dict) and "fingerprint" in inner:
        applied = data.get("applied_version_id")
        return WeaveCache(
            proposal=inner,
            applied_version_id=applied if isinstance(applied, int) else None,
            accepted_roles=_ints(data.get("accepted_roles")),
            decided_roles=_ints(data.get("decided_roles")),
        )
    if "fingerprint" in data:
        return WeaveCache(proposal=data)
    return None


def dump(
    proposal: dict[str, Any],
    *,
    applied_version_id: int | None = None,
    accepted_roles: list[int] | tuple[int, ...] | None = None,
    decided_roles: list[int] | tuple[int, ...] | None = None,
) -> str:
    accepted = list(accepted_roles or ())
    decided = list(decided_roles or ())
    if applied_version_id is None and not accepted and not decided:
        return json.dumps(proposal)
    return json.dumps({
        "proposal": proposal,
        "applied_version_id": applied_version_id,
        "accepted_roles": accepted,
        "decided_roles": decided,
    })
