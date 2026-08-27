"""Public Myro Skill Certificate receipt. No user identity or evidence."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.database import get_supabase_admin
from app.repositories.skill_certificates import SkillCertificates
from app.schemas.career_path_api import SkillCertificatePublic

router = APIRouter(prefix="/public/skill-certificates", tags=["public"])


@router.get("/{verification_id}", response_model=SkillCertificatePublic)
def public_skill_certificate(verification_id: str) -> SkillCertificatePublic:
    row = SkillCertificates(get_supabase_admin()).public_receipt(verification_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found.")
    return SkillCertificatePublic(
        skill_display_name=str(row.get("skill_display_name") or ""),
        achieved_level=int(row.get("achieved_level") or 0),
        passed_at=str(row.get("passed_at") or ""),
        verification_id=str(row.get("verification_id") or verification_id),
        assessment_edition=str(row.get("assessment_edition") or ""),
    )
