"""The one authenticated career-skill-path contract."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.repositories.learning_path_requests import LearningPathRequests
from app.repositories.skill_certificates import SkillCertificates
from app.schemas.career_path_api import (
    CareerSkillPathResponse,
    LearningPathRequestBody,
    LearningPathRequestResponse,
    SkillCertificatePublic,
)
from app.services.career_skill_path_read import assemble
from app.services.career_target import current_snapshot

router = APIRouter(prefix="/career-skill-path", tags=["career-skill-path"])


@router.get("", response_model=CareerSkillPathResponse)
def get_career_skill_path(
    principal: Principal = Depends(get_principal),
) -> CareerSkillPathResponse:
    payload = assemble(get_supabase_admin(), principal.id)
    return CareerSkillPathResponse(**payload)


@router.post("/learning-requests", response_model=LearningPathRequestResponse)
def request_learning_path(
    body: LearningPathRequestBody,
    principal: Principal = Depends(get_principal),
) -> LearningPathRequestResponse:
    db = get_supabase_admin()
    snapshot = current_snapshot(db, principal.id)
    if not snapshot:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose your direction first.")
    row, created = LearningPathRequests(db).request(
        principal.id,
        body.taxonomy_key.strip(),
        skill_id=None,
        snapshot_id=str(snapshot["id"]) if snapshot else None,
        seniority=str(snapshot["seniority"]) if snapshot else None,
    )
    _ = row
    return LearningPathRequestResponse(
        taxonomy_key=body.taxonomy_key.strip(),
        status="recorded" if created else "already_recorded",
        message="Demand recorded, we’ll let you know as soon as the assessment is live.",
    )


@router.delete("/learning-requests/{taxonomy_key}", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_learning_path(
    taxonomy_key: str,
    principal: Principal = Depends(get_principal),
) -> None:
    withdrawn = LearningPathRequests(get_supabase_admin()).withdraw(
        principal.id, taxonomy_key
    )
    if not withdrawn:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active request to withdraw.")


@router.get("/certificates/{verification_id}", response_model=SkillCertificatePublic)
def get_own_or_public_certificate(
    verification_id: str,
    principal: Principal = Depends(get_principal),
) -> SkillCertificatePublic:
    cert = SkillCertificates(get_supabase_admin()).by_verification(verification_id)
    if not cert or str(cert.get("user_id")) != str(principal.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found.")
    return SkillCertificatePublic(
        skill_display_name=str(cert["skill_display_name"]),
        achieved_level=int(cert["achieved_level"]),
        passed_at=str(cert["passed_at"]),
        verification_id=str(cert["verification_id"]),
        assessment_edition=str(cert["assessment_edition"]),
    )
