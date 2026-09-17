"""Model Outcome — classified result of one LLM completion on a named write.

See CONTEXT.md. Callers read `kind`. They do not guess from a missing value.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.services.background.dispatch import TransientJobError

Kind = Literal["ok", "unavailable", "malformed", "invalid_input"]

PERMANENT_KINDS = frozenset({"malformed", "invalid_input"})


@dataclass(frozen=True)
class ModelOutcome:
    kind: Kind
    value: Any = None
    detail: str | None = None

    @property
    def retryable(self) -> bool:
        return self.kind == "unavailable"

    @classmethod
    def ok(cls, value: Any) -> ModelOutcome:
        return cls("ok", value)

    @classmethod
    def unavailable(cls, detail: str = "provider") -> ModelOutcome:
        return cls("unavailable", detail=detail)

    @classmethod
    def malformed(cls, detail: str = "unparseable") -> ModelOutcome:
        return cls("malformed", detail=detail)

    @classmethod
    def invalid_input(cls, detail: str) -> ModelOutcome:
        return cls("invalid_input", detail=detail)


def retry_transient(outcome: ModelOutcome, *, allow_retry: bool) -> None:
    """ADR-0008: only unavailable is TRANSIENT. Permanent kinds return to the caller."""
    if outcome.retryable and allow_retry:
        raise TransientJobError(outcome.detail or outcome.kind)


def split_cached_evals(
    fetched: dict[str, dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], frozenset[str]]:
    """Scored verdicts the brain may reuse, and ids it must not call again."""
    scored = {
        key: row for key, row in fetched.items() if row.get("overall_score") is not None
    }
    settled = frozenset(
        key for key, row in fetched.items() if row.get("eval_outcome") in PERMANENT_KINDS
    )
    return scored, settled


def is_settled_permanent(row: dict[str, Any] | None) -> bool:
    return bool(row) and row.get("eval_outcome") in PERMANENT_KINDS
