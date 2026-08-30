"""A cleared level lands on the CV by itself.

Decision 8 of the learning grill (2026-08-30): a certificate IS CV evidence, and
it needs no claim step. Myro issued it, so writing it down is recording a fact
rather than asserting one on the user's behalf — which is why this is allowed to
write to their document when the flywheel's bullet rewrite is not. A rewrite
puts words in their mouth about work they did; this states something we tested.

Three rules, all of them consequences of "a cleared level is permanent":

1. **One line per skill, at the highest level.** Clearing L1→L5 issues five
   certificates. Five Cold Calling lines on a CV would be absurd, so the line is
   replaced in place, not appended to.

2. **It always reappears.** A user who deletes the line and then clears the next
   level gets it back. Shivam's call, and the reasoning is that the achievement
   is locked — it belongs in the user's own inventory of CV pointers, not to a
   single render they once edited. The friction is real and worth naming:
   someone who removed it on purpose will see it return, and the only way to
   keep it off is to stop levelling that skill.

3. **Never below what is already there.** If the CV somehow shows a higher level
   than the certificate being promoted (a replayed job, an out-of-order write),
   the line is left alone. A promote may raise a claim, never lower one.

Matching is by `verification_id` first — exact, and immune to the user having
reworded the line — then by the skill name as a fallback for a line we wrote
before ids were on it. Anything we cannot confidently identify is left alone and
a new line is added beside it, because deleting a line we did not recognise is
how a CV loses something the user wrote.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.database import get_supabase_admin
from app.repositories.cv import CVVersionsRepository, CVVersionWriteSpec
from app.repositories.skill_certificates import SkillCertificates, cv_line
from app.services import background, cv_compose, cv_skill_edit
from app.services.cv_structured_shape import has_content

logger = logging.getLogger(__name__)

MAX_CERT_LINES = 60


def _norm(value: str) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _level_in(line: str) -> int:
    """The level a rendered line claims, or 0. Read back from our own format so
    an out-of-order promote cannot lower a standing claim."""
    match = re.search(r"\blevel\s+(\d+)\s+of\s+\d+", line, flags=re.IGNORECASE)
    return int(match.group(1)) if match else 0


def _is_line_for(line: str, *, skill_name: str, known_ids: set[str]) -> bool:
    """Does this CV line already represent this skill's certificate?

    Exact id match first: it survives the user rewording everything around it.
    Name match second, anchored to the start, so "Cold Calling — Level 2…" is
    caught but a bullet that merely mentions cold calling in passing is not.
    """
    if any(vid and vid in line for vid in known_ids):
        return True
    name = _norm(skill_name)
    if not name:
        return False
    head = _norm(line)
    return head.startswith(name) and "verified by myro" in head


def apply_certificate(
    certs: list[str],
    certificate: dict[str, Any],
    *,
    prior_verification_ids: set[str] | None = None,
) -> tuple[list[str], bool]:
    """Return (certs, changed). Pure — the caller owns the CV write.

    `prior_verification_ids` are this user's earlier certificates for the SAME
    skill, so a line written at L2 is found and replaced when L3 lands.
    """
    line = cv_line(certificate)
    skill_name = certificate.get("skill_display_name") or certificate.get("taxonomy_key") or ""
    new_level = int(certificate.get("achieved_level") or 0)
    known = set(prior_verification_ids or set())
    vid = str(certificate.get("verification_id") or "")
    if vid:
        known.add(vid)

    out: list[str] = []
    replaced = False
    for existing in certs:
        if not replaced and _is_line_for(existing, skill_name=skill_name, known_ids=known):
            # Never lower a claim that is already on the document.
            if _level_in(existing) > new_level:
                return list(certs), False
            if _norm(existing) == _norm(line):
                return list(certs), False
            out.append(line)
            replaced = True
            continue
        out.append(existing)

    if not replaced:
        # Absent — including "the user deleted it". Rule 2: it comes back.
        if len(out) >= MAX_CERT_LINES:
            logger.info(
                "metric certificate_to_cv.capped skill=%s lines=%d", skill_name, len(out),
            )
            return list(certs), False
        out.append(line)

    return out, True


# ── The write ────────────────────────────────────────────────────────────────


@background.handler("certificate_to_cv")
async def _certificate_to_cv_handler(payload: dict[str, Any], allow_retry: bool) -> None:
    """Bulk-lane job: put a freshly earned certificate on the Main CV.

    Off the request path on purpose. The user is looking at their score and the
    roles they just cleared; a baseline write, a re-render and a re-tag behind
    it must not be what they are waiting for.

    Terminal and quiet: a certificate that fails to land is a line missing from
    a document, not a lost achievement — `skill_certificates` already holds the
    truth and the next clear on that skill promotes again.
    """
    user_id = str(payload.get("user_id") or "")
    verification_id = str(payload.get("verification_id") or "")
    if not user_id or not verification_id:
        return

    admin = get_supabase_admin()
    certs_repo = SkillCertificates(admin)
    certificate = certs_repo.by_verification(verification_id)
    if not certificate or str(certificate.get("user_id")) != user_id:
        return

    cv_repo = CVVersionsRepository(admin)
    baseline = cv_repo.latest_baseline(user_id)
    if baseline is None or not has_content(baseline.get("cv_structured")):
        # No CV to write onto yet. The certificate stands; it lands when they
        # upload one and never silently half-writes a structure that isn't there.
        logger.info("metric certificate_to_cv.no_baseline user=%s", user_id)
        return

    structured: dict[str, Any] = dict(baseline.get("cv_structured") or {})
    current: list[str] = [str(c) for c in (structured.get("certs") or [])]

    skill_id = certificate.get("skill_id")
    prior_ids = {
        str(c.get("verification_id") or "")
        for c in certs_repo.for_user(user_id)
        if c.get("skill_id") == skill_id and c.get("verification_id")
    }

    updated, changed = apply_certificate(current, certificate, prior_verification_ids=prior_ids)
    if not changed:
        return

    structured["certs"] = updated
    new_body_text = cv_skill_edit.render_baseline_text(structured)
    next_n = cv_repo.next_user_version_number(user_id)
    new_baseline = cv_repo.create(
        user_id,
        CVVersionWriteSpec(
            kind="baseline_upload",
            job_id=None,
            parent_version_id=None,
            body_text=new_body_text,
            cv_structured=structured,
            title="Master CV · certificate",
            snapshot_hash=cv_compose.item_id("certificate", next_n, new_body_text),
            confidence_label="myro-verified",
        ),
    )
    certs_repo.stamp_promoted(user_id, verification_id, new_baseline["id"])

    # The certs section is CV text, so the skill it names is now CV evidence —
    # decision 8. The re-tag is what turns that into a level the score reads.
    background.enqueue(
        background.LANE_BULK,
        "skill_retag",
        payload={
            "user_id": user_id,
            "baseline_id": new_baseline["id"],
            "new_body_text": new_body_text,
        },
        correlation_id=str(new_baseline["id"]),
    )
    logger.info(
        "metric certificate_to_cv.promoted user=%s skill=%s baseline=%s",
        user_id, skill_id, new_baseline["id"],
    )
