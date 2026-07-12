"""Career Story Reservoir endpoints — dump in, profile out, project per job.

  POST  /cv/reservoir/ingest          files (PDF/DOCX/TXT/MD/CSV/ZIP) + pasted
                                      text → inflow entries → durable story_ingest
  GET   /cv/reservoir/profile         roles → stories → pointers (+ inflow status)
  PATCH /cv/reservoir/stories/{id}    curate: archive / edit title/narrative/skills
  POST  /cv/reservoir/project         stories → tailored deterministic CV Version

LinkedIn export zips/CSVs are rendered to career text deterministically and flow
through the same extraction path. Extraction auto-accepts (curate-after policy,
2026-07-11); archive-not-delete.
"""
from __future__ import annotations

import zipfile
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.db_safe import safe_read
from app.deps import CurrentUser, get_current_user, get_user_db
from app.repositories.career_reservoir import (
    CareerReservoirRepository,
    get_career_reservoir_repository,
)
from app.repositories.connections import ConnectionsRepository, get_token_connections_repository
from app.repositories.cv import CVVersionsRepository, CVVersionWriteSpec, get_token_cv_repository
from app.repositories.cv_dump import CvDumpRepository, get_cv_dump_repository
from app.services import career_projection, career_reservoir, cv_compose
from app.services.connections_import import looks_like_connections_csv, parse_connections_csv
from app.services.reservoir_intake import (
    MAX_FILE_BYTES,
    extract_file_text,
    is_linkedin_noise,
    is_recommendations_given,
    read_linkedin_zip,
)

router = APIRouter()

_MAX_FILES = 15
_MIN_CHARS = 80          # CVUP4-style scanned/empty guard


# ── ingest ───────────────────────────────────────────────────────────────────

class IngestedEntry(BaseModel):
    id: str
    filename: str | None = None
    kind: str
    chars: int


class SkippedFile(BaseModel):
    filename: str
    reason: str


class IngestResponse(BaseModel):
    entries: list[IngestedEntry]
    skipped: list[SkippedFile]
    connections_saved: int = 0


@router.post("/reservoir/ingest", response_model=IngestResponse)
async def ingest_dump(
    files: list[UploadFile] = File(default=[]),
    text: str | None = Form(default=None),
    user: CurrentUser = Depends(get_current_user),
    dump_repo: CvDumpRepository = Depends(get_cv_dump_repository),
    conn_repo: ConnectionsRepository = Depends(get_token_connections_repository),
) -> IngestResponse:
    if len(files) > _MAX_FILES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Max {_MAX_FILES} files per dump.")

    entries: list[IngestedEntry] = []
    skipped: list[SkippedFile] = []
    connections: dict[tuple, dict] = {}

    def _collect_connections(rows: list[dict]) -> None:
        for r in rows:
            connections[(r.get("full_name"), r.get("company"), r.get("position"))] = r

    for f in files:
        name = f.filename or "file"
        raw = await f.read()
        if len(raw) > MAX_FILE_BYTES:
            skipped.append(SkippedFile(filename=name, reason="Over 8MB"))
            continue
        lower = name.lower()
        if lower.endswith(".csv"):
            if is_linkedin_noise(name):
                skipped.append(SkippedFile(filename=name, reason="LinkedIn telemetry — no career signal"))
                continue
            if is_recommendations_given(name):
                skipped.append(SkippedFile(filename=name, reason="Recommendations you wrote about others"))
                continue
            if looks_like_connections_csv(raw):
                _collect_connections(parse_connections_csv(raw))
                continue
        if lower.endswith(".zip"):
            try:
                zip_text, used, zip_conns = read_linkedin_zip(raw)
            except zipfile.BadZipFile:
                skipped.append(SkippedFile(filename=name, reason="Not a readable zip"))
                continue
            _collect_connections(zip_conns)
            if not used:
                if not zip_conns:
                    skipped.append(SkippedFile(filename=name, reason="No LinkedIn CSVs found in the zip"))
                continue
            file_text, kind = zip_text, "linkedin"
        else:
            try:
                file_text, kind = extract_file_text(name, raw)
            except ValueError as exc:
                skipped.append(SkippedFile(filename=name, reason=str(exc)))
                continue
        if len("".join(file_text.split())) < _MIN_CHARS:
            skipped.append(SkippedFile(filename=name, reason="No readable text"))
            continue
        row = dump_repo.add(
            user.id, file_text, source="reservoir_dump",
            kind=kind, payload={"filename": name},
        )
        entry_id = str(row.get("id") or "")
        if entry_id:
            entries.append(IngestedEntry(id=entry_id, filename=name, kind=kind, chars=len(file_text)))

    pasted = (text or "").strip()
    if pasted:
        if len("".join(pasted.split())) < _MIN_CHARS:
            skipped.append(SkippedFile(filename="pasted text", reason="Too short to extract from"))
        else:
            row = dump_repo.add(
                user.id, pasted, source="reservoir_dump",
                kind="file", payload={"filename": None},
            )
            entry_id = str(row.get("id") or "")
            if entry_id:
                entries.append(IngestedEntry(id=entry_id, filename=None, kind="file", chars=len(pasted)))

    connections_saved = 0
    if connections:
        connections_saved = conn_repo.replace_all(user.id, list(connections.values()))

    if not entries and not skipped and not connections_saved:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Nothing to ingest — add files or text.")

    for e in entries:
        career_reservoir.enqueue_ingest(user.id, e.id)

    return IngestResponse(entries=entries, skipped=skipped, connections_saved=connections_saved)


# ── profile ──────────────────────────────────────────────────────────────────

class ProfileStory(BaseModel):
    id: str
    kind: str
    title: str
    narrative: dict[str, str] = Field(default_factory=dict)
    metrics: list[dict[str, str]] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    status: str = "active"
    pointer: str = ""
    variant_count: int = 0


class ProfileRole(BaseModel):
    id: str
    company: str
    title: str
    location: str = ""
    date_label: str = ""
    kind: str = "work"
    stories: list[ProfileStory]


class ProfileView(BaseModel):
    roles: list[ProfileRole]
    highlights: list[ProfileStory]
    competencies: list[str]
    story_count: int
    pending_inflows: int


@router.get("/reservoir/profile", response_model=ProfileView)
def reservoir_profile(
    user: CurrentUser = Depends(get_current_user),
    repo: CareerReservoirRepository = Depends(get_career_reservoir_repository),
) -> ProfileView:
    roles = repo.list_roles(user.id)
    stories = repo.list_stories(user.id)
    pointers = repo.story_pointers(user.id, [str(s["id"]) for s in stories])
    view = career_reservoir.build_profile_view(
        roles, stories, pointers, pending_inflows=repo.ingest_status(user.id)["pending"],
    )
    return ProfileView(**view)


# ── curation ─────────────────────────────────────────────────────────────────

class StoryPatch(BaseModel):
    status: str | None = Field(default=None, pattern="^(active|archived)$")
    title: str | None = None
    narrative: dict[str, str] | None = None
    skills: list[str] | None = None


@router.patch("/reservoir/stories/{story_id}", response_model=ProfileStory)
def patch_story(
    story_id: str,
    body: StoryPatch,
    user: CurrentUser = Depends(get_current_user),
    repo: CareerReservoirRepository = Depends(get_career_reservoir_repository),
) -> ProfileStory:
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Nothing to update.")
    row = repo.update_story(user.id, story_id, updates)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Story not found.")
    pointers = repo.story_pointers(user.id, [story_id])
    canonical = next((p for p in pointers if p.get("is_canonical")), pointers[0] if pointers else None)
    return ProfileStory(
        id=str(row["id"]),
        kind=row.get("kind") or "project",
        title=row.get("title") or "",
        narrative=row.get("narrative") or {},
        metrics=row.get("metrics") or [],
        skills=row.get("skills") or [],
        status=row.get("status") or "active",
        pointer=(canonical or {}).get("text") or "",
        variant_count=len(pointers),
    )


# ── projection ───────────────────────────────────────────────────────────────

class ProjectRequest(BaseModel):
    job_id: str


class ProjectResponse(BaseModel):
    version_id: int
    included: int
    parked: int


@router.post("/reservoir/project", response_model=ProjectResponse)
def project_reservoir(
    body: ProjectRequest,
    user: CurrentUser = Depends(get_current_user),
    repo: CareerReservoirRepository = Depends(get_career_reservoir_repository),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    db: Any = Depends(get_user_db),
) -> ProjectResponse:
    baseline = cv_repo.latest_baseline(user.id)
    if not baseline or not (baseline.get("cv_structured") or {}):
        raise HTTPException(status.HTTP_409_CONFLICT, "Upload a CV first.")

    job = safe_read(
        db.table("jobs")
        .select("job_id, job_title, company_name, main_skills, side_skills")
        .eq("job_id", body.job_id)
        .maybe_single(),
        default=None,
        context="career_project_job",
    )
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found.")

    roles = repo.list_roles(user.id)
    stories = repo.list_stories(user.id)
    if not stories:
        raise HTTPException(status.HTTP_409_CONFLICT, "No stories in your reservoir yet — dump your CVs first.")
    pointers = repo.story_pointers(user.id, [str(s["id"]) for s in stories])

    result = career_projection.project_for_job(
        user_id=user.id, job=job, baseline=baseline,
        roles=roles, stories=stories, pointers=pointers,
    )
    if not result["included_ids"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "No stories have pointers to project yet.")

    version = cv_repo.create(user.id, CVVersionWriteSpec(
        kind="deterministic",
        job_id=body.job_id,
        parent_version_id=int(baseline["id"]),
        body_text=cv_compose.render_deterministic(result["cv_structured"]),
        cv_structured=result["cv_structured"],
        title=f"Reservoir projection · {job.get('company_name') or job.get('job_title') or ''}".strip(" ·"),
    ))
    return ProjectResponse(
        version_id=int(version["id"]),
        included=len(result["included_ids"]),
        parked=len(result["parked_ids"]),
    )
