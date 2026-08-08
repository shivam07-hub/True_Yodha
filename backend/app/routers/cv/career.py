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

from app.deps import CurrentUser, get_current_user, get_user_db
from app.repositories.career_reservoir import (
    CareerReservoirRepository,
    get_career_reservoir_repository,
)
from app.repositories.connections import ConnectionsRepository, get_token_connections_repository
from app.repositories.cv import CVVersionsRepository, CVVersionWriteSpec, get_token_cv_repository
from app.repositories.cv_dump import CvDumpRepository, get_cv_dump_repository
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.services import career_projection, career_reservoir, cv_compose, jd_coverage, role_dedup
from app.services.llm_provider import get_blocking_judgment_provider
from app.services.connections_import import looks_like_connections_csv, parse_connections_csv
from app.services.cv_structured_shape import has_content
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


class MergeSuggestion(BaseModel):
    """A judge-proposed same-role pair awaiting the user's ruling (#38)."""
    role_a: str
    role_b: str
    a_label: str
    b_label: str


class ProfileView(BaseModel):
    roles: list[ProfileRole]
    highlights: list[ProfileStory]
    competencies: list[str]
    story_count: int
    pending_inflows: int
    merge_suggestions: list[MergeSuggestion] = Field(default_factory=list)
    #: auto-folded duplicate roles in the last 7 days — the visible receipt
    tidied_roles: int = 0


def _role_label(role: dict) -> str:
    company = str(role.get("company") or "").strip()
    title = str(role.get("title") or "").strip()
    dates = str(role.get("date_label") or "").strip()
    head = " — ".join(p for p in (company, title) if p)
    return f"{head} ({dates})" if dates else head


@router.get("/reservoir/profile", response_model=ProfileView)
def reservoir_profile(
    user: CurrentUser = Depends(get_current_user),
    repo: CareerReservoirRepository = Depends(get_career_reservoir_repository),
) -> ProfileView:
    career_reservoir.retry_stale_ingests(repo, user.id)  # heal dead ingest jobs
    roles = repo.list_roles(user.id)
    career_reservoir.maybe_enqueue_role_dedup(user.id, roles)  # lazy #38 sweep
    stories = repo.list_stories(user.id)
    pointers = repo.story_pointers(user.id, [str(s["id"]) for s in stories])
    view = career_reservoir.build_profile_view(
        roles, stories, pointers, pending_inflows=repo.ingest_status(user.id)["pending"],
    )
    # Judge-proposed merge cards: only pairs whose BOTH roles are still active
    # (a curation archive in between voids the question).
    active = {str(r["id"]): r for r in roles if (r.get("status") or "active") == "active"}
    suggestions = [
        MergeSuggestion(
            role_a=str(p["role_a"]), role_b=str(p["role_b"]),
            a_label=_role_label(active[str(p["role_a"])]),
            b_label=_role_label(active[str(p["role_b"])]),
        )
        for p in repo.merge_proposals(user.id)
        if str(p["role_a"]) in active and str(p["role_b"]) in active
    ]
    return ProfileView(
        **view,
        merge_suggestions=suggestions,
        tidied_roles=repo.recent_auto_folds(user.id),
    )


class MergeVerdictRequest(BaseModel):
    role_a: str
    role_b: str
    verdict: str = Field(pattern="^(merged|keep_separate)$")


class MergeVerdictResponse(BaseModel):
    verdict: str


@router.post("/reservoir/roles/merge-verdict", response_model=MergeVerdictResponse)
def role_merge_verdict(
    body: MergeVerdictRequest,
    user: CurrentUser = Depends(get_current_user),
    repo: CareerReservoirRepository = Depends(get_career_reservoir_repository),
    db: Any = Depends(get_user_db),
) -> MergeVerdictResponse:
    """The user rules on a proposed same-role pair (Stories-tab merge card).
    A human ruling is LAW — the judge never re-litigates a decided pair."""
    roles = {str(r["id"]): r for r in repo.list_roles(user.id)}
    a, b = roles.get(body.role_a), roles.get(body.role_b)
    if not a or not b:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found.")
    if body.verdict == "merged":
        counts: dict[str, int] = {}
        for s in repo.list_stories(user.id):
            rid = str(s.get("role_id") or "")
            if rid:
                counts[rid] = counts.get(rid, 0) + 1
        keep, dup = role_dedup.pick_keep(a, b, counts)
        role_dedup.apply_fold(db, user.id, keep, dup)
    repo.record_merge_verdict(user.id, body.role_a, body.role_b, body.verdict, "user")
    return MergeVerdictResponse(verdict=body.verdict)


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
async def project_reservoir(
    body: ProjectRequest,
    user: CurrentUser = Depends(get_current_user),
    repo: CareerReservoirRepository = Depends(get_career_reservoir_repository),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    jobs_repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ProjectResponse:
    baseline = cv_repo.latest_baseline(user.id)
    if not baseline or not has_content(baseline.get("cv_structured")):
        raise HTTPException(status.HTTP_409_CONFLICT, "Upload a CV first.")

    rows = jobs_repo.get_jobs_by_ids([body.job_id])
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found.")
    job = rows[0]

    roles = repo.list_roles(user.id)
    stories = repo.list_stories(user.id)
    if not stories:
        raise HTTPException(status.HTTP_409_CONFLICT, "No stories in your reservoir yet — dump your CVs first.")
    pointers = repo.story_pointers(user.id, [str(s["id"]) for s in stories])

    # Rank against the JD's REAL requirements (Lane C), not the scraped skill
    # taxonomy. Reuse the "Job fit" panel's cached parse when present (same
    # requirements the user already saw, no duplicate LLM spend); parse fresh on
    # the paid-first blocking lane otherwise. Only reached once the user actually
    # has stories to project — never burn a JD parse on an empty reservoir.
    requirements: list[str] = []
    cached = jd_coverage.payload_to_result(
        jobs_repo.get_deepening(user.id, body.job_id, jd_coverage.CACHE_PROMPT_KEY)
    )
    if cached is not None:
        requirements = [i.requirement for i in cached[0].requirements]
    if not requirements:
        requirements = await jd_coverage.parse_requirements(
            job.get("job_description") or "", get_blocking_judgment_provider()
        )

    result = await career_projection.project_for_job(
        user_id=user.id, job=job, requirements=requirements, baseline=baseline,
        roles=roles, stories=stories, pointers=pointers,
        story_embeddings=repo.story_embeddings(user.id),
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


# ── JD coverage (Lane C — the JD-interview loop) ───────────────────────────────

class JDCoverageRequest(BaseModel):
    job_id: str
    # Recompute even when a cached panel exists — used after a banked gap answer's
    # story lands. Default reads the cache so requirements stay stable per job.
    refresh: bool = False


class CoverageRow(BaseModel):
    requirement: str
    status: str  # covered | weak | gap
    story_id: str | None = None
    story_title: str = ""
    story_pointer: str = ""


class JDCoverageResponse(BaseModel):
    requirements: list[CoverageRow]
    covered: int
    weak: int
    gap: int
    cached: bool = False
    computed_at: str = ""


@router.post("/jd-coverage", response_model=JDCoverageResponse)
async def jd_coverage_for_job(
    body: JDCoverageRequest,
    user: CurrentUser = Depends(get_current_user),
    jobs_repo: JobsRepository = Depends(get_token_jobs_repository),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> JDCoverageResponse:
    """"What this job wants" — LLM-parse the JD's real requirements, classify each
    against the user's career stories AND the CV's own lines (a line already on
    the CV must never read "Missing"). The panel that drives the tailoring
    interview AND the Preparations room. Cached per (user, job) in
    job_deepenings — stable requirements between visits; `refresh` recomputes."""
    rows = jobs_repo.get_jobs_by_ids([body.job_id])
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found.")

    def _respond(res: jd_coverage.CoverageResult, cached: bool, computed_at: str) -> JDCoverageResponse:
        return JDCoverageResponse(
            requirements=[
                CoverageRow(
                    requirement=i.requirement, status=i.status, story_id=i.story_id,
                    story_title=i.story_title, story_pointer=i.story_pointer,
                )
                for i in res.requirements
            ],
            covered=res.covered, weak=res.weak, gap=res.gap,
            cached=cached, computed_at=computed_at,
        )

    if not body.refresh:
        hit = jd_coverage.payload_to_result(
            jobs_repo.get_deepening(user.id, body.job_id, jd_coverage.CACHE_PROMPT_KEY)
        )
        if hit is not None:
            result, computed_at = hit
            return _respond(result, cached=True, computed_at=computed_at)

    jd_text = rows[0].get("job_description") or ""
    baseline = cv_repo.latest_baseline(user.id)
    # Blocking panel → paid-first strong lane; free-tier 429 storms were blanking
    # the coverage panel (2026-07-16, Sanofi/mit20). Cached once per (user, job).
    result = await jd_coverage.assess(
        user.id, jd_text, get_blocking_judgment_provider(),
        cv_bullets=jd_coverage.bullets_from_cv((baseline or {}).get("cv_structured") or {}),
    )
    # Never cache an empty parse — it usually means a provider failure (fail-soft
    # []), and freezing that would blank the panel forever.
    if result.requirements:
        jobs_repo.upsert_deepening(
            user.id, body.job_id, jd_coverage.CACHE_PROMPT_KEY,
            jd_coverage.result_to_payload(result),
        )
    return _respond(result, cached=False, computed_at="")


class GapAnswerRequest(BaseModel):
    requirement: str = Field(max_length=400)
    answer: str = Field(min_length=1, max_length=4000)
    job_id: str | None = None


class GapAnswerResponse(BaseModel):
    entry_id: str


@router.post("/jd-coverage/answer", response_model=GapAnswerResponse)
async def jd_coverage_answer(
    body: GapAnswerRequest,
    user: CurrentUser = Depends(get_current_user),
    dump_repo: CvDumpRepository = Depends(get_cv_dump_repository),
    jobs_repo: JobsRepository = Depends(get_token_jobs_repository),
) -> GapAnswerResponse:
    """The mentor asked ONE question about a gap; the user's answer flows through
    the dump pipeline into a NEW career story — immediately reusable for this CV
    and banked for interview prep. Every tailoring session grows the reservoir."""
    answer = body.answer.strip()
    if len("".join(answer.split())) < 12:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tell me a bit more so I can capture it.")
    requirement = " ".join(body.requirement.split()).strip()
    framed = f"Career experience — {requirement}:\n{answer}" if requirement else f"Career experience:\n{answer}"
    row = dump_repo.add(
        user.id, framed, source="jd_gap_answer",
        kind="note", payload={"requirement": requirement or None, "job_id": body.job_id},
    )
    entry_id = str(row.get("id") or "")
    if not entry_id:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not save your answer.")
    career_reservoir.enqueue_ingest(user.id, entry_id)
    # Flip the cached coverage row to covered NOW (deterministic, no LLM) so the
    # panel — and any later weave interview — never re-asks an answered question.
    # The next refresh recompute replaces the patch with the ingested story.
    if body.job_id and requirement:
        patched = jd_coverage.patch_requirement_answered(
            jobs_repo.get_deepening(user.id, body.job_id, jd_coverage.CACHE_PROMPT_KEY),
            requirement, answer,
        )
        if patched:
            jobs_repo.upsert_deepening(user.id, body.job_id, jd_coverage.CACHE_PROMPT_KEY, patched)
    return GapAnswerResponse(entry_id=entry_id)
