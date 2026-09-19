"""A file that arrived as composed text is still a file.

Anon claim used to prefer the playground snapshot and POST `/cv/text` as
`text_describe`, even when the user dropped a PDF. Onboarding then recorded
`uploaded_cv` plus the file's name. The two disagreed. New claims bill from
origin. This retags the people who already have the split record the next time
they open a door that already loads those facts — not a backfill.
"""
from __future__ import annotations

import logging
from typing import Any

from app.repositories.onboarding import OnboardingRepository

logger = logging.getLogger("myro.forward_pass")


def file_tagged_as_text(source: Any, metadata: Any) -> bool:
    if source != "text_describe":
        return False
    if not isinstance(metadata, dict):
        return False
    return bool(str(metadata.get("name") or "").strip())


def heal_loaded(
    db: Any,
    user_id: str,
    state: dict[str, Any] | None,
    baseline: dict[str, Any] | None,
) -> bool:
    """Patch source + entry_mode. Does not rewrite the historical XP ledger."""
    state = state or {}
    if not baseline or not file_tagged_as_text(
        baseline.get("source"), state.get("accepted_file_metadata"),
    ):
        return False
    version_id = baseline.get("id")
    if not version_id:
        return False
    db.table("cv_versions").update({"source": "pdf_upload"}).eq("id", version_id).execute()
    if state.get("entry_mode") != "uploaded_cv":
        OnboardingRepository(db).patch_state(user_id, {"entry_mode": "uploaded_cv"})
    logger.info("metric forward_pass.cv_source_retagged user=%s version=%s", user_id, version_id)
    return True
