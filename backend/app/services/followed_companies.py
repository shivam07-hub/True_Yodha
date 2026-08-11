"""The single domain module for a candidate's explicit Followed Companies."""
from __future__ import annotations

from typing import Protocol, TypedDict

from fastapi import HTTPException, status

from app.services.xp_policy import FOLLOWED_COMPANY_LIMIT


class FollowedCompaniesPort(Protocol):
    def get_followed_companies(self, user_id: str) -> list[dict]: ...

    def follow_company(self, user_id: str, company_name: str) -> dict: ...

    def unfollow_company(self, user_id: str, company_name: str) -> None: ...


class FollowCompanyReceipt(TypedDict):
    company_name: str


def _normalized_name(company_name: str) -> str:
    return " ".join(company_name.split())


def list_followed_companies(port: FollowedCompaniesPort, user_id: str) -> list[dict]:
    return port.get_followed_companies(user_id)


def follow_company(
    port: FollowedCompaniesPort,
    user_id: str,
    company_name: str,
) -> FollowCompanyReceipt:
    """Follow once, idempotently, with the cap decided atomically in Postgres."""
    name = _normalized_name(company_name)
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="company_name required.")

    outcome = port.follow_company(user_id, name)
    if outcome.get("outcome") == "limit_reached":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Slot limit reached — max {FOLLOWED_COMPANY_LIMIT} companies.",
        )
    followed_name = outcome.get("company_name")
    if not isinstance(followed_name, str) or not followed_name:
        raise RuntimeError("Followed Company mutation returned an invalid company.")
    return {"company_name": followed_name}


def unfollow_company(port: FollowedCompaniesPort, user_id: str, company_name: str) -> None:
    port.unfollow_company(user_id, _normalized_name(company_name))
