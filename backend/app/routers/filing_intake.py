"""GET/POST /filing-intake — the ₹599 process, before any charge."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.repositories.filing_intake import (
    FilingIntakeRepository,
    get_filing_intake_repository,
    intake_error,
)

router = APIRouter(prefix="/filing-intake", tags=["filing"])


class IntakeBody(BaseModel):
    target_role: str = Field(max_length=200)
    cities: str = Field(max_length=400)
    portals: str = Field(max_length=800)
    consent: bool


class IntakeResponse(BaseModel):
    saved: bool
    target_role: str = ""
    cities: str = ""
    portals: str = ""
    consented: bool = False
    paid: bool = False


def _view(row: dict | None) -> IntakeResponse:
    if not row:
        return IntakeResponse(saved=False)
    return IntakeResponse(
        saved=True,
        target_role=str(row.get("target_role") or ""),
        cities=str(row.get("cities") or ""),
        portals=str(row.get("portals") or ""),
        consented=bool(row.get("consented_at")),
        paid=bool(row.get("paid_at")),
    )


@router.get("", response_model=IntakeResponse)
def get_intake(
    principal: Principal = Depends(get_principal),
    repo: FilingIntakeRepository = Depends(get_filing_intake_repository),
) -> IntakeResponse:
    return _view(repo.get(principal.id))


@router.post("", response_model=IntakeResponse)
def save_intake(
    body: IntakeBody,
    principal: Principal = Depends(get_principal),
    repo: FilingIntakeRepository = Depends(get_filing_intake_repository),
) -> IntakeResponse:
    error = intake_error(
        role=body.target_role,
        cities=body.cities,
        portals=body.portals,
        consent=body.consent,
    )
    if error == "consent":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Consent comes before the process starts.",
        )
    if error == "incomplete":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Role, cities, and career pages come with the consent.",
        )
    return _view(
        repo.save(
            user_id=principal.id,
            role=body.target_role,
            cities=body.cities,
            portals=body.portals,
        )
    )
