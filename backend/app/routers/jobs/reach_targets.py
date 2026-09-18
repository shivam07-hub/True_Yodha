"""Reach Target router — ADR-0018 Path 3 send ledger.

The user pastes a LinkedIn /in/{vanity} URL and a name. We store the
nomination and record user-confirmed send states. No fetch, no send.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.repositories.reach_targets import (
    ReachTargetsRepository,
    get_token_reach_targets_repository,
)
from app.services.deepening_keys import DeepeningKey
from app.services.reach_target import (
    MAX_TARGETS_PER_USER,
    can_advance,
    fill_first_name,
    followup_due_at,
    is_due,
    parse_linkedin_profile_url,
)

router = APIRouter()

# Imported, not retyped: this constant used to be declared privately in
# BOTH reach modules, so renaming one would have left the other reading
# an empty cache with no error.
_PACK_PROMPT_KEY = DeepeningKey.REACH_PACK
_ACTIONS = ("sent", "followed_up", "replied", "stopped")


class ReachTargetIn(BaseModel):
    profile_url: str = Field(max_length=400)
    display_name: str = Field(min_length=1, max_length=80)
    company: str | None = Field(default=None, max_length=200)
    role_title: str | None = Field(default=None, max_length=200)
    job_id: str | None = Field(default=None, max_length=80)


class ReachTargetOut(BaseModel):
    id: str
    job_id: str | None
    profile_url: str
    display_name: str
    company: str | None
    role_title: str | None
    status: str
    connect_note: str
    followup_note: str
    referral_ask: str
    sent_at: str | None
    followup_due_at: str | None
    replied_at: str | None
    due: bool
    created_at: str | None


class ReachTargetList(BaseModel):
    targets: list[ReachTargetOut]
    due_count: int


class AdvanceBody(BaseModel):
    action: str = Field(max_length=20)


def _iso(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    text = str(value).strip()
    return text or None


def _parse_stamp(value: object) -> datetime | None:
    text = _iso(value)
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        stamp = datetime.fromisoformat(text)
    except ValueError:
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp


def _to_out(row: dict, now: datetime) -> ReachTargetOut:
    status_value = str(row.get("status") or "queued")
    due_at = _parse_stamp(row.get("followup_due_at"))
    return ReachTargetOut(
        id=str(row["id"]),
        job_id=row.get("job_id"),
        profile_url=str(row.get("profile_url") or ""),
        display_name=str(row.get("display_name") or ""),
        company=row.get("company"),
        role_title=row.get("role_title"),
        status=status_value,
        connect_note=str(row.get("connect_note") or ""),
        followup_note=str(row.get("followup_note") or ""),
        referral_ask=str(row.get("referral_ask") or ""),
        sent_at=_iso(row.get("sent_at")),
        followup_due_at=_iso(row.get("followup_due_at")),
        replied_at=_iso(row.get("replied_at")),
        due=is_due(status_value, due_at, now),
        created_at=_iso(row.get("created_at")),
    )


def _pack_notes(jobs_repo: JobsRepository, user_id: str, job_id: str | None, display_name: str) -> tuple[str, str, str]:
    if not job_id:
        return "", "", ""
    raw = jobs_repo.get_deepening(user_id, job_id, _PACK_PROMPT_KEY)
    if not raw:
        return "", "", ""
    try:
        pack = json.loads(raw)
    except json.JSONDecodeError:
        return "", "", ""
    if not isinstance(pack, dict):
        return "", "", ""
    connect = fill_first_name(str(pack.get("outreach_message") or ""), display_name)
    ask = fill_first_name(str(pack.get("referral_ask") or ""), display_name)
    timing = str(pack.get("timing") or "").strip()
    return connect, timing, ask


@router.get("/reach/targets", response_model=ReachTargetList)
def list_reach_targets(
    job_id: str | None = Query(default=None, max_length=80),
    due: bool = Query(default=False),
    principal: Principal = Depends(get_principal),
    repo: ReachTargetsRepository = Depends(get_token_reach_targets_repository),
) -> ReachTargetList:
    now = datetime.now(timezone.utc)
    rows = repo.list_for_user(principal.id, job_id=job_id, due_only=due, now=now)
    targets = [_to_out(r, now) for r in rows]
    due_count = sum(1 for t in targets if t.due) if not due else len(targets)
    return ReachTargetList(targets=targets, due_count=due_count)


@router.post("/reach/targets", response_model=ReachTargetOut, status_code=status.HTTP_201_CREATED)
def create_reach_target(
    body: ReachTargetIn,
    principal: Principal = Depends(get_principal),
    repo: ReachTargetsRepository = Depends(get_token_reach_targets_repository),
    jobs_repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ReachTargetOut:
    url = parse_linkedin_profile_url(body.profile_url)
    if url is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Paste a LinkedIn profile URL (linkedin.com/in/…), not a search.",
        )
    name = body.display_name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Add the name you read on that profile.",
        )
    if repo.count(principal.id) >= MAX_TARGETS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Desk is full ({MAX_TARGETS_PER_USER}). Close a few before adding more.",
        )
    connect, follow, ask = _pack_notes(jobs_repo, principal.id, body.job_id, name)
    now = datetime.now(timezone.utc)
    try:
        row = repo.insert(
            {
                "user_id": principal.id,
                "job_id": body.job_id,
                "profile_url": url,
                "display_name": name,
                "company": (body.company or "").strip() or None,
                "role_title": (body.role_title or "").strip() or None,
                "status": "queued",
                "connect_note": connect,
                "followup_note": follow,
                "referral_ask": ask,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            }
        )
    except APIError as exc:
        message = str(exc).lower()
        if "duplicate" in message or "unique" in message or "23505" in message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That profile is already on this job.",
            ) from exc
        raise
    return _to_out(row, now)


@router.post("/reach/targets/{target_id}/advance", response_model=ReachTargetOut)
def advance_reach_target(
    target_id: str,
    body: AdvanceBody,
    principal: Principal = Depends(get_principal),
    repo: ReachTargetsRepository = Depends(get_token_reach_targets_repository),
) -> ReachTargetOut:
    action = body.action.strip()
    if action not in _ACTIONS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown action.")
    row = repo.get(principal.id, target_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not on the desk.")
    current = str(row.get("status") or "queued")
    if not can_advance(current, action):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot mark {current} as {action}.",
        )
    now = datetime.now(timezone.utc)
    patch: dict = {"status": action, "updated_at": now.isoformat()}
    if action == "sent":
        patch["sent_at"] = now.isoformat()
        patch["followup_due_at"] = followup_due_at(now).isoformat()
    if action == "replied":
        patch["replied_at"] = now.isoformat()
    updated = repo.update(principal.id, target_id, patch)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not on the desk.")
    return _to_out(updated, now)
