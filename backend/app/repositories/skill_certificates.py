"""Immutable Myro Skill Certificates. Never writes user_skills."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.services.skill_levels import MAX_LEVEL, standard_for

VERIFY_PATH_PREFIX = "/verify/skill/"
VERIFY_URL_PREFIX = "myro.com/v/"

_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun",
           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def _month_year(passed_at: Any) -> str:
    """"Aug 2026". A CV states when something was earned, not on which Tuesday —
    a full ISO date reads like a log line and dates the user more precisely than
    they asked to be dated."""
    raw = str(passed_at or "")[:10]
    parts = raw.split("-")
    if len(parts) != 3:
        return ""
    try:
        return f"{_MONTHS[int(parts[1]) - 1]} {parts[0]}"
    except (ValueError, IndexError):
        return ""


def cv_line(cert: dict[str, Any]) -> str:
    """The certificate as one line on the user's CV.

    Written for a reader who has never heard of Myro. Three things it must do,
    and the previous format did none of them:

      - **Give the scale.** "Level 3" alone is unreadable; "Level 3 of 5" is a
        position a stranger can place.
      - **Say what the level MEANS**, in the same words the assessment was
        calibrated from (`skill_levels`). A level with no definition is a claim
        the reader has to take on trust from a brand they do not know.
      - **Be checkable by a person.** The old line ended in a bare id, which is
        machine-readable and human-useless. A URL is something a recruiter can
        actually open.

    "Myro Skill Certificate" is dropped: this renders inside the CV's
    Certifications section, so the noun is already on the page.
    """
    name = cert.get("skill_display_name") or cert.get("taxonomy_key") or "Skill"
    std = standard_for(cert.get("achieved_level"))
    when = _month_year(cert.get("passed_at"))
    verification_id = cert.get("verification_id") or ""

    # An unrecognised level claims no level at all. "Level None of 5" on a CV is
    # worse than silence: it is visibly broken on the one document the user
    # hands to someone else.
    head = name if std is None else f"{name} — Level {std.level} of {MAX_LEVEL}: {std.means}"
    parts = [f"{head}. Verified by Myro"]
    if when:
        parts.append(when)
    if verification_id:
        parts.append(f"{VERIFY_URL_PREFIX}{verification_id}")
    return " · ".join(parts)


def verify_path(verification_id: str) -> str:
    return f"{VERIFY_PATH_PREFIX}{verification_id}"


class SkillCertificates:
    def __init__(self, db: Client) -> None:
        self._db = db

    def for_attempt(self, attempt_id: str) -> dict[str, Any] | None:
        rows = (
            self._db.table("skill_certificates")
            .select("*")
            .eq("attempt_id", attempt_id)
            .limit(1)
            .execute()
        ).data or []
        return rows[0] if rows else None

    def for_user(self, user_id: str) -> list[dict[str, Any]]:
        return (
            self._db.table("skill_certificates")
            .select("*")
            .eq("user_id", user_id)
            .order("passed_at", desc=True)
            .execute()
        ).data or []

    def by_verification(self, verification_id: str) -> dict[str, Any] | None:
        rows = (
            self._db.table("skill_certificates")
            .select("*")
            .eq("verification_id", verification_id)
            .limit(1)
            .execute()
        ).data or []
        return rows[0] if rows else None

    def public_receipt(self, verification_id: str) -> dict[str, Any] | None:
        rows = self._db.rpc(
            "skill_certificate_public", {"p_verification_id": verification_id}
        ).execute().data or []
        if not rows:
            return None
        row = rows[0] if isinstance(rows[0], dict) else {"skill_display_name": rows[0]}
        return row

    def issue(
        self,
        *,
        user_id: str,
        skill_id: int,
        taxonomy_key: str,
        display_name: str,
        level: int,
        attempt_id: str,
        assessment_edition: str,
    ) -> dict[str, Any]:
        existing = self.for_attempt(attempt_id)
        if existing:
            return existing
        row = {
            "user_id": user_id,
            "skill_id": skill_id,
            "taxonomy_key": taxonomy_key,
            "skill_display_name": display_name,
            "achieved_level": level,
            "attempt_id": attempt_id,
            "assessment_edition": assessment_edition,
            "verification_id": f"msk_{secrets.token_urlsafe(12)}",
            "passed_at": datetime.now(timezone.utc).isoformat(),
        }
        created = self._db.table("skill_certificates").insert(row).execute().data or []
        return created[0] if created else row

    def stamp_promoted(self, user_id: str, verification_id: str, baseline_id: int) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self._db.table("skill_certificates").update(
            {
                "cv_promoted_at": now,
                "cv_promoted_baseline_id": baseline_id,
            }
        ).eq("user_id", user_id).eq("verification_id", verification_id).is_(
            "cv_promoted_at", "null"
        ).execute()

    def issue_for_pass(
        self,
        *,
        user_id: str,
        skill_id: int,
        level: int,
        attempt_id: str,
    ) -> dict[str, Any]:
        skill = (
            self._db.table("skills")
            .select("taxonomy_key, display_name")
            .eq("id", skill_id)
            .maybe_single()
            .execute()
        )
        data = skill.data if skill else None
        name = (data or {}).get("display_name") or f"Skill {skill_id}"
        key = (data or {}).get("taxonomy_key") or str(skill_id)
        issued = self.issue(
            user_id=user_id,
            skill_id=skill_id,
            taxonomy_key=str(key),
            display_name=str(name),
            level=level,
            attempt_id=attempt_id,
            assessment_edition=f"upskilling-L{level}",
        )
        return {
            **issued,
            "verify_path": verify_path(str(issued.get("verification_id") or "")),
            "cv_line": cv_line(issued),
            "certificate_status": "on_cv" if issued.get("cv_promoted_at") else "issued",
        }

    def stamp_from_structured(
        self, user_id: str, certs: list[str], baseline_id: int
    ) -> None:
        blob = "\n".join(certs)
        for cert in self.for_user(user_id):
            vid = str(cert.get("verification_id") or "")
            if vid and vid in blob and not cert.get("cv_promoted_at"):
                self.stamp_promoted(user_id, vid, baseline_id)
