"""Public, no-auth platform stats — landing-page Engine counters.

GET /public/stats returns the live counts behind the landing page's
"Engine" section (design spec docs/DESIGN_landing_myro_engine.md §6).
Cached in-process for 1h — this endpoint must never add DB pressure
per pageview. The frontend floors the values for display ("4,300+")
so public numbers only ever grow.
"""

import logging
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.config import settings
from app.database import get_supabase_admin
from app.repositories.search_queries import SearchQueriesRepository
from app.repositories.jobs import get_public_jobs_repository
from app.repositories.scores import ScoresRepository
from app.security import redact_sensitive_text
from app.services import cv_parser, cv_restructure, cv_rewrite, job_query_parser
from app.services.cv_pdf_html import (
    CVPdfError,
    content_disposition as _content_disposition,
    render_html_to_pdf,
    sanitize_pdf_filename as _sanitize_pdf_filename,
)
from app.services.llm_provider import (
    get_cv_upload_provider,
    get_interactive_provider,
    get_llm_provider,
)
from app.services.matching.filter_spec import FilterSpec
from app.services.matching.job_query import JobQuery
from app.services.scoring.formulas import build_skill_level_map
from app.services.scoring.orchestrator import project_score

router = APIRouter(prefix="/public", tags=["public"])

_log = logging.getLogger("app.public")

# Taxonomy size is effectively static (Lightcast-scale skill graph); not worth
# a per-hour count query. Update alongside taxonomy upgrades.
SKILLS_MAPPED = 32_000

_CACHE_TTL_SECONDS = 3600.0
_cache_data: dict[str, Any] | None = None
_cache_ts: float = 0.0


def _count_seekers() -> int:
    result = (
        get_supabase_admin()
        .table("user_profiles")
        .select("id", count="exact")
        .limit(1)
        .execute()
    )
    return int(result.count or 0)


@router.get("/stats")
def get_public_stats() -> dict[str, Any]:
    global _cache_data, _cache_ts

    now = time.monotonic()
    if _cache_data is not None and now - _cache_ts < _CACHE_TTL_SECONDS:
        return _cache_data

    # compile_market_analytics is snapshot-backed + in-process cached, so this
    # is cheap after the first call.
    analytics = get_public_jobs_repository().compile_market_analytics()

    data: dict[str, Any] = {
        "jobs_tracked": int(analytics.get("total_jobs") or 0),
        "companies_monitored": int(analytics.get("total_companies") or 0),
        "skills_mapped": SKILLS_MAPPED,
        "seekers": _count_seekers(),
        "as_of": datetime.now(timezone.utc).isoformat(),
    }
    _cache_data = data
    _cache_ts = now
    return data


# ─── Public CV-score preview (no auth) ───────────────────────────────────────
#
# The pre-login "drop your CV, see your real Myro Score" demo. Runs the REAL
# scoring engine compute-only: parse → build_skill_level_map → project_score
# (no user, no persist — ScoresRepository over the admin client only touches
# global taxonomy reference data because include_market_signals=False). The
# CV bytes are read, parsed, and discarded in-request — nothing is stored
# (PV1). Everything actionable (jobs, practice, save, tailor, full skill list)
# stays gated behind signup; this endpoint returns the score + domain split
# only — the hook, not the product.

_MAX_CV_BYTES = 5 * 1024 * 1024  # 5MB — same ceiling as the authed upload path
_MIN_TEXT_CHARS = 80  # CVUP4 scanned-PDF guard: reject before any LLM spend
_ALLOWED_CONTENT_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}

# Soft per-IP sliding-window limit. In-process (per worker) — a soft cost guard,
# NOT the primary bot defence (that's Turnstile). Good enough at current scale;
# promote to a Redis window if multi-instance precision is ever needed.
#
# Per-action buckets keyed by (action, ip): scoring, AI bullet rewrite, and
# whole-CV restructure each have their own ceiling because they cost different
# amounts of LLM budget. Unlimited actions (page-fill, hide/show bullets) never
# touch the server, so there's nothing to cap there.
_ANON_RATE_WINDOW_SECONDS = 3600.0
_ANON_RATE_MAX = {"score": 5, "rewrite": 6, "restructure": 2, "job_search": 12, "download_event": 10, "export": 10}
_ANON_RATE_MSG = {
    "score": "You've previewed a few CVs already. Sign up to keep scoring.",
    "rewrite": "You've polished a lot of bullets. Sign up to keep improving your CV.",
    "restructure": "You've restructured this CV a couple of times. Sign up to keep going.",
    "job_search": "You've run a lot of searches. Sign up to save jobs and see your fit.",
    "export": "You've downloaded a few CVs already. Sign up to save and keep working.",
}
_anon_hits: dict[tuple[str, str], deque[float]] = {}

_TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


class AnonDomainScore(BaseModel):
    name: str
    score: int


class AnonContact(BaseModel):
    name: str = ""
    title: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin: str = ""


class AnonScoreResponse(BaseModel):
    """Compute-only preview — the score + domain split the landing Readout
    renders, plus the parsed CV reformatted to the Myro standard so a
    logged-out user can see (but not download) their own CV the Myro way.
    Nothing is persisted (PV1); skill names, jobs, and download stay gated."""

    score: int
    verdict: str
    domains: list[AnonDomainScore]
    gaps: list[AnonDomainScore]       # weakest domains → "improve before applying"
    strengths: list[AnonDomainScore]  # strongest domains → "already strong"
    skills_detected: int
    # The CV reformatted to the Myro standard (PdfPage shape). None when the
    # provider returned skills but no structured payload (degraded but scorable).
    cv: dict[str, Any] | None = None
    contact: AnonContact | None = None


class PublicJobFitPreviewResponse(BaseModel):
    job_id: str
    title: str
    company: str | None
    fit_pct: float
    matched_count: int
    total_skills: int
    matched_skills: list[str]
    missing_skills: list[str]
    cv_preview: AnonScoreResponse


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _enforce_anon_rate(action: str, ip: str) -> None:
    now = time.monotonic()
    limit = _ANON_RATE_MAX.get(action, 5)
    hits = _anon_hits.setdefault((action, ip), deque())
    while hits and now - hits[0] > _ANON_RATE_WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_ANON_RATE_MSG.get(action, "Too many requests. Sign up to keep going."),
        )
    hits.append(now)


async def _verify_turnstile(token: str | None, ip: str) -> None:
    """Verify the Turnstile token when a secret is configured. When it isn't
    (dev / pre-provision), skip — the per-IP limit still applies. Fail-closed
    only once a secret exists: then a missing/invalid token is a hard 403."""
    secret = settings.turnstile_secret
    if not secret:
        return
    if not token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification required.")
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                _TURNSTILE_VERIFY_URL,
                data={"secret": secret, "response": token, "remoteip": ip},
            )
        ok = bool(resp.json().get("success"))
    except Exception:
        _log.warning("Turnstile verify call failed; rejecting to stay fail-closed")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed.")
    if not ok:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed.")


def _verdict_for(score: int) -> str:
    if score >= 75:
        return "Strong profile — ready to apply to most matched roles."
    if score >= 55:
        return "Strong enough to apply, with a few high-value gaps still holding the profile back."
    if score >= 35:
        return "A solid base. Closing a few in-demand gaps will move this fast."
    return "Early-stage profile — the biggest gains are the gaps below."


async def _score_anon_cv(
    request: Request,
    file: UploadFile | None,
    cf_turnstile_token: str | None,
    text: str | None = None,
) -> tuple[dict[str, Any], dict[str, int], AnonScoreResponse]:
    ip = _client_ip(request)
    _enforce_anon_rate("score", ip)
    await _verify_turnstile(cf_turnstile_token, ip)

    # Paste-text path (#4, Vaibhav email): the pasted text IS the raw CV text, so
    # skip file transport + extraction entirely — a small form POST that dodges
    # the multipart-upload failures some networks/regions hit. Same guards after.
    pasted = (text or "").strip()
    if pasted:
        raw_text = pasted[: _MAX_CV_BYTES]
    elif file is not None:
        content_type = (file.content_type or "").split(";")[0].strip()
        file_type = _ALLOWED_CONTENT_TYPES.get(content_type)
        if not file_type:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Upload a PDF or DOCX CV, or paste your CV text.",
            )

        # Read with a hard ceiling — one extra byte tells us it's over the cap.
        data = await file.read(_MAX_CV_BYTES + 1)
        if len(data) > _MAX_CV_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="That file is over 5MB. Try a smaller PDF or DOCX.",
            )

        try:
            raw_text = cv_parser.extract_raw_text(data, file_type)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="We couldn't read that file. Try a different PDF or DOCX export.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Upload a PDF or DOCX CV, or paste your CV text.",
        )

    # CVUP4 — reject scanned/empty PDFs before spending any LLM budget.
    if len(raw_text.strip()) < _MIN_TEXT_CHARS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Paste a bit more of your CV — a few lines of experience and skills."
                if pasted
                else "This looks like a scanned image with no selectable text. Upload a text-based PDF or DOCX."
            ),
        )

    parsed = await cv_parser.parse_cv_text(raw_text, provider=get_cv_upload_provider())
    if parsed.get("provider_failed"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Our CV analysis service is busy right now. Try again in a moment.",
        )

    skills_detected = parsed.get("skills_detected", [])
    if not skills_detected:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="We couldn't pull skills from this CV. Add named tools, technologies, and bullet achievements, then try again.",
        )

    # Real engine, compute-only. include_market_signals=False mirrors the authed
    # CV-ingest path (record_cv_score) and keeps this off the demand tables.
    level_map = build_skill_level_map(skills_detected)
    repo = ScoresRepository(get_supabase_admin())
    projection = project_score(repo, level_map, include_market_signals=False)

    score = int(round(projection.total_score))
    domains = sorted(
        (AnonDomainScore(name=name, score=int(round(value))) for name, value in projection.domain_scores.items()),
        key=lambda d: d.score,
        reverse=True,
    )
    strengths = [d for d in domains if d.score >= 50][:3]
    gaps = [d for d in reversed(domains) if d.score < 50][:3]

    # Split the parsed structured CV into the PdfPage body shape + a contact
    # block. The body keys mirror the frontend CVStructured type; contact is
    # rendered into the CV header. Both are None when extraction was degraded.
    structured = parsed.get("cv_structured") or None
    cv_body: dict[str, Any] | None = None
    contact: AnonContact | None = None
    if structured:
        contact = AnonContact(**(structured.get("contact") or {}))
        cv_body = {
            "summary":     structured.get("summary"),
            "education":   structured.get("education") or [],
            "experience":  structured.get("experience") or [],
            "projects":    structured.get("projects") or [],
            "skills_line": structured.get("skills_line"),
            "certs":       structured.get("certs") or [],
        }

    preview = AnonScoreResponse(
        score=score,
        verdict=_verdict_for(score),
        domains=domains,
        gaps=gaps,
        strengths=strengths,
        skills_detected=len(skills_detected),
        cv=cv_body,
        contact=contact,
    )
    return parsed, level_map, preview


def _compute_public_fit(
    skill_rows: list[dict[str, Any]],
    level_map: dict[str, int],
) -> tuple[float, list[str], list[str], int]:
    user_lower = {k.lower(): v for k, v in level_map.items() if k and v > 0}
    matched: list[str] = []
    missing: list[str] = []
    max_possible = 0.0
    score = 0.0
    seen: set[str] = set()

    for row in skill_rows:
        key = (row.get("taxonomy_key") or "").strip()
        lower = key.lower()
        if not key or lower in seen:
            continue
        seen.add(lower)
        weight = 2.0 if row.get("is_primary") else 1.0
        max_possible += weight
        if lower in user_lower:
            score += weight
            matched.append(key)
        else:
            missing.append(key)

    pct = round(score / max_possible * 100, 1) if max_possible else 0.0
    return pct, matched, missing, len(seen)


@router.post("/score-cv", response_model=AnonScoreResponse)
async def score_cv_preview(
    request: Request,
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    cf_turnstile_token: str | None = Form(default=None),
) -> AnonScoreResponse:
    _parsed, _level_map, preview = await _score_anon_cv(request, file, cf_turnstile_token, text)
    return preview


@router.post("/jobs/{job_id}/fit-preview", response_model=PublicJobFitPreviewResponse)
async def job_fit_preview(
    job_id: str,
    request: Request,
    file: UploadFile = File(...),
    cf_turnstile_token: str | None = Form(default=None),
) -> PublicJobFitPreviewResponse:
    _parsed, level_map, preview = await _score_anon_cv(request, file, cf_turnstile_token)
    job = get_public_jobs_repository().get_job_skills(job_id)
    if not job or not job.get("skills"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found or has no skills")

    fit_pct, matched, missing, total = _compute_public_fit(job["skills"], level_map)
    return PublicJobFitPreviewResponse(
        job_id=job_id,
        title=job.get("job_title") or "",
        company=job.get("company_name"),
        fit_pct=fit_pct,
        matched_count=len(matched),
        total_skills=total,
        matched_skills=matched,
        missing_skills=missing,
        cv_preview=preview,
    )


# ─── Public CV playground — AI actions (no auth, no persist) ──────────────────
#
# The pre-login playground (/cv-preview) lets a logged-out user improve the CV
# they just scored: per-bullet Mentor rewrite + whole-CV restructure. Both reuse
# the EXACT same pure services as the authed surface (cv_rewrite.suggest_rewrite,
# cv_restructure.suggest_restructure) — compute-only, applies nothing, persists
# nothing (PV1). The authed surface charges Myro Coins on restructure-keep; anon
# is free as a deliberate loss-leader (neutralised by the 3000-coin welcome grant
# on signup, XP-DB1). Guarded by Turnstile (when provisioned) + per-action IP
# caps. There is NO main-CV job here, so role/company/keywords are optional and
# the rewrite/restructure fall back to generic best-practice (grill Q1).


class AnonRewriteRequest(BaseModel):
    bullet:           str
    role:             str | None = None
    missing_keywords: list[str] = []
    metric:           str | None = None
    allow_no_metric:  bool = False
    cf_turnstile_token: str | None = None


class AnonRewriteResponse(BaseModel):
    mode:           str               # "rewrite" | "question" | "error"
    rewritten_text: str | None = None
    question:       str | None = None
    rationale:      str | None = None


class AnonRewriteVariant(BaseModel):
    angle: str
    label: str
    text:  str


class AnonRewriteVariantsResponse(BaseModel):
    mode:      str                       # "variants" | "question" | "error"
    variants:  list[AnonRewriteVariant] = []
    question:  str | None = None
    rationale: str | None = None


class AnonRestructureRequest(BaseModel):
    cv_text:          str
    role:             str | None = None
    company:          str | None = None
    missing_keywords: list[str] = []
    cf_turnstile_token: str | None = None


class AnonRestructureResponse(BaseModel):
    mode:          str               # "proposal" | "error"
    proposed_text: str | None = None
    changes:       list[str] = []
    rationale:     str | None = None
    playbook:      str | None = None
    uncertainty:   str | None = None


@router.post("/rewrite-bullet", response_model=AnonRewriteResponse)
async def rewrite_bullet_preview(
    body: AnonRewriteRequest,
    request: Request,
) -> AnonRewriteResponse:
    ip = _client_ip(request)
    _enforce_anon_rate("rewrite", ip)
    await _verify_turnstile(body.cf_turnstile_token, ip)

    result = await cv_rewrite.suggest_rewrite(
        body.bullet,
        body.role,
        body.missing_keywords,
        body.metric,
        get_interactive_provider(),
        allow_no_metric=body.allow_no_metric,
    )
    return AnonRewriteResponse(**result)


@router.post("/rewrite-bullet/variants", response_model=AnonRewriteVariantsResponse)
async def rewrite_bullet_variants_preview(
    body: AnonRewriteRequest,
    request: Request,
) -> AnonRewriteVariantsResponse:
    """3-angle rewrite (metric/impact/scope) for the pick-a-version flow. Shares
    the same IP bucket + no-fabrication question branch as the single rewrite."""
    ip = _client_ip(request)
    _enforce_anon_rate("rewrite", ip)
    await _verify_turnstile(body.cf_turnstile_token, ip)

    result = await cv_rewrite.suggest_rewrite_variants(
        body.bullet,
        body.role,
        body.missing_keywords,
        body.metric,
        get_interactive_provider(),
        allow_no_metric=body.allow_no_metric,
    )
    return AnonRewriteVariantsResponse(
        mode=result["mode"],
        variants=[AnonRewriteVariant(**v) for v in result.get("variants", [])],
        question=result.get("question"),
        rationale=result.get("rationale"),
    )


@router.post("/restructure", response_model=AnonRestructureResponse)
async def restructure_preview(
    body: AnonRestructureRequest,
    request: Request,
) -> AnonRestructureResponse:
    ip = _client_ip(request)
    _enforce_anon_rate("restructure", ip)
    await _verify_turnstile(body.cf_turnstile_token, ip)

    result = await cv_restructure.suggest_restructure(
        cv_text=body.cv_text,
        role=body.role,
        company=body.company,
        missing_keywords=body.missing_keywords,
        provider=get_interactive_provider(),
    )
    # suggest_restructure returns a superset (includes a couple of internal keys);
    # the response_model filters to the public shape.
    return AnonRestructureResponse(
        mode=result["mode"],
        proposed_text=result.get("proposed_text"),
        changes=result.get("changes") or [],
        rationale=result.get("rationale"),
        playbook=result.get("playbook"),
        uncertainty=result.get("uncertainty"),
    )


# ─── Public WYSIWYG CV export (no auth) ──────────────────────────────────────
#
# ADR-0020: every CV artifact — authed OR logged-out — renders from the SAME
# `.cvb-pdf-page` sheet through the SAME headless-Chromium renderer, so the
# downloaded PDF is byte-for-byte what the user previewed (Geist embedded, ₹
# survives, no browser-print reflow). The authed path is POST /cv/export-pdf
# (principal-gated); this is its anon twin. The renderer is stateless (HTML →
# PDF, no DB, no user), so it's safe behind the same Turnstile + per-IP guard
# as the other /public CV endpoints. On 503 the client falls back to native
# print — a visible sheet exists in the playground.


class AnonExportPdfRequest(BaseModel):
    html: str = Field(..., min_length=40, max_length=512_000)
    filename: str | None = Field(default=None, max_length=160)
    cf_turnstile_token: str | None = None


@router.post("/cv/export-pdf")
async def export_cv_pdf_public(
    body: AnonExportPdfRequest,
    request: Request,
) -> Response:
    ip = _client_ip(request)
    _enforce_anon_rate("export", ip)
    await _verify_turnstile(body.cf_turnstile_token, ip)

    try:
        # sync_playwright() cannot run inside the asyncio event loop — this route
        # is `async` (for the awaited Turnstile check), so the blocking render must
        # hop to a worker thread (mirrors the authed `def` route's threadpool run).
        pdf_bytes = await run_in_threadpool(render_html_to_pdf, body.html)
    except CVPdfError as exc:
        # Soft failure — the playground falls back to native print on 503.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=redact_sensitive_text(exc),
        ) from exc
    safe = _sanitize_pdf_filename(body.filename)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(safe)},
    )


# ─── Public job-gen search (no auth) ─────────────────────────────────────────
#
# Backlog #33, Q2/Q3: "tell us the job you want" → REAL openings only. The NL
# prompt is parsed to structured filters (role + location), then the existing
# live feed is searched. No fabrication, ever — every card is a real `jobs` row.
# This is the secondary landing proof-search; apply/save stay gated to signup.
# Thinnest durable path: one parse step in, real cards out.

_JOB_SEARCH_MAX_QUERY = 200


class JobSearchInterpreted(BaseModel):
    role: str
    location_city: str | None = None
    location_country: str | None = None
    location_mode: str | None = None
    skills: list[str] = []


class JobSearchCard(BaseModel):
    job_id: str
    title: str
    company: str | None = None
    location: str | None = None
    location_city: str | None = None
    location_country: str | None = None
    location_mode: str | None = None
    first_seen: str | None = None


class JobSearchResponse(BaseModel):
    cards: list[JobSearchCard]
    total: int
    interpreted: JobSearchInterpreted
    # Filters we relaxed to surface the closest real roles (e.g. ["location"]).
    # Empty = strict match. Drives the "showing closest matches" note (#33 Q3).
    relaxed: list[str] = []


class JobSearchRequest(BaseModel):
    query: str
    cf_turnstile_token: str | None = None
    session_id: str | None = None  # anon correlation → links forward to signup


@router.post("/job-search", response_model=JobSearchResponse)
async def public_job_search(
    body: JobSearchRequest,
    request: Request,
) -> JobSearchResponse:
    ip = _client_ip(request)
    _enforce_anon_rate("job_search", ip)
    await _verify_turnstile(body.cf_turnstile_token, ip)

    query = " ".join((body.query or "").split())[:_JOB_SEARCH_MAX_QUERY]
    if len(query) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Tell us the kind of role you want — e.g. 'product roles in Bangalore'.",
        )

    filters = await job_query_parser.parse_job_query(query, get_llm_provider())
    # NL parse → canonical FilterSpec → tuned SQL (Consolidation C). `filters` still
    # feeds the `interpreted` echo + the search log; the spec drives the query.
    spec = FilterSpec.from_nl_parse(filters)
    result = JobQuery.public(get_public_jobs_repository(), spec)

    cards = [
        JobSearchCard(
            job_id=str(row.get("job_id") or ""),
            title=row.get("job_title") or "",
            company=row.get("company_name"),
            location=row.get("location"),
            location_city=row.get("location_city"),
            location_country=row.get("location_country"),
            location_mode=row.get("location_mode"),
            first_seen=row.get("first_seen"),
        )
        for row in result["rows"]
        if row.get("job_id")
    ]
    SearchQueriesRepository.record(
        surface="landing",
        query=query,
        session_id=body.session_id,
        parsed=filters,
        result_count=int(result["total"]),
    )
    return JobSearchResponse(
        cards=cards,
        total=int(result["total"]),
        interpreted=JobSearchInterpreted(**filters),
        relaxed=result["relaxed"],
    )


class AnonDownloadEvent(BaseModel):
    """Metadata-only record of a pre-login CV download (#34 S6, Q13b=C).
    NO CV content — PV1-clean. `anon_session_id` is a random client id that
    links forward to signup; `saved_intent` distinguishes 'Save & download'
    (chose to sign up) from 'Just download'."""

    anon_session_id: str | None = None
    score: int | None = None
    fix_count: int | None = None
    career_level: str | None = None
    file_format: str | None = None
    saved_intent: bool = False


@router.post("/cv-download-event", status_code=status.HTTP_204_NO_CONTENT)
async def record_cv_download_event(request: Request, body: AnonDownloadEvent) -> Response:
    """Record that an anon visitor downloaded a CV. Fire-and-forget telemetry —
    the download already happened client-side, so a slow/failed insert never
    blocks it. Metadata only; the CV body is not captured here (consent-gated,
    #17)."""
    _enforce_anon_rate("download_event", _client_ip(request))
    try:
        get_supabase_admin().table("anon_cv_download_events").insert({
            "anon_session_id": (body.anon_session_id or "")[:64] or None,
            "score": body.score,
            "fix_count": body.fix_count,
            "career_level": (body.career_level or "")[:40] or None,
            "file_format": (body.file_format or "")[:16] or None,
            "saved_intent": body.saved_intent,
        }).execute()
    except Exception:  # noqa: BLE001 — telemetry must never surface to the user
        _log.warning("metric anon_download.persist_failed")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
