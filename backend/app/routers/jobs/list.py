import logging
from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from postgrest.exceptions import APIError

from app.deps import Principal, get_principal
from app.repositories.company_signals import (
    CompanySignalsRepository,
    get_company_signals_repository,
)
from app.repositories.jobs import (
    CompanySearchUnavailable,
    JobsRepository,
    _job_feed_marker_to_iso,
    get_public_jobs_repository,
    get_token_jobs_repository,
)
from app.services.concurrent_reads import run_concurrently
from app.services.matching import feed_warm
from app.services.matching.filter_spec import FilterSpec
from app.services.matching.job_query import JobQuery
from app.services.job_refresh import user_has_live_refresh
from app.services.phase_timing import phase_timer
from app.schemas import (
    CompanyOpenRoleItem,
    CompanyOpenRolesResponse,
    CompanyHiringItem,
    TopCompaniesAtResponse,
    EntitySkillsResponse,
    GlobalJobHit,
    GlobalJobSearchResponse,
    JobSearchResponse,
    MarketAnalyticsSummaryResponse,
    NameCountItem,
    SkillCountItem,
)
from app.schemas.jobs import (
    FeedWarmResponse,
    HiddenJobItem,
    JobFeedItem,
    JobFeedResponse,
    JobSearchItem,
    MatchEval,
    SkillHeatmapResponse,
)
from app.schemas.company_pulse import (
    CompanyPulseItem,
    CompanyPulseResponse,
    IndexableCompaniesResponse,
    IndexableCompanyItem,
)
from app.schemas.company_gap_signals import CompanyGapSignalItem, CompanyGapSignalsResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/feed/hidden", response_model=list[HiddenJobItem])
def hidden_feed_jobs(
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> list[HiddenJobItem]:
    return [HiddenJobItem(**row) for row in repo.get_dismissed_jobs(principal.id)]


@router.get("/companies/search")
def search_companies(
    q: Annotated[str, Query(min_length=2, max_length=100)],
    limit: Annotated[int, Query(ge=1, le=20)] = 10,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> list[str]:
    try:
        return repo.search_companies(q, limit=limit)
    except CompanySearchUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Company search is temporarily unavailable.",
        ) from exc


@router.get("/analytics/me", response_model=MarketAnalyticsSummaryResponse)
def get_my_analytics(
    cluster: str | None = None,
    location_city: str | None = None,
    location_country: str | None = None,
    location_mode: str | None = None,
    repo: JobsRepository = Depends(get_token_jobs_repository),
    principal: Principal = Depends(get_principal),
) -> MarketAnalyticsSummaryResponse:
    if cluster:
        role_domain = repo.resolve_role_domain_for_clusters([cluster])
    else:
        target_roles = repo.get_user_target_roles(principal.id)
        role_domain = repo.resolve_role_domain_for_clusters(target_roles) if target_roles else None
    analytics = repo.compile_market_analytics(
        role_domain=role_domain,
        location_city=location_city,
        location_country=location_country,
        location_mode=location_mode,
    )
    return MarketAnalyticsSummaryResponse(
        total_jobs=analytics["total_jobs"],
        total_companies=analytics["total_companies"],
        total_industries=analytics["total_industries"],
        latest_batch=analytics["latest_batch"],
        scraper_started=analytics.get("scraper_started"),
        total_jobs_today=analytics.get("total_jobs_today", 0),
        jobs_added_1h=analytics.get("jobs_added_1h", 0),
        companies_added_7d=analytics.get("companies_added_7d", 0),
        by_company=[
            NameCountItem(
                name=name,
                count=count,
                last_seen_at=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("last_seen_at"),
                velocity_bins=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("velocity_bins"),
                country=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("country"),
                industry=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("industry"),
            )
            for name, count in analytics["by_company"]
        ],
        by_industry=[NameCountItem(name=name, count=count) for name, count in analytics["by_industry"]],
        by_role=[NameCountItem(name=name, count=count) for name, count in analytics["by_role"]],
        by_location_city=[NameCountItem(name=name, count=count) for name, count in analytics["by_location_city"]],
        by_location_country=[NameCountItem(name=name, count=count) for name, count in analytics["by_location_country"]],
        by_location_mode=[NameCountItem(name=name, count=count) for name, count in analytics["by_location_mode"]],
        industry_roles={
            industry: [NameCountItem(name=name, count=count) for name, count in roles]
            for industry, roles in analytics.get("industry_roles", {}).items()
        },
        top_skills=[SkillCountItem(skill=skill, count=count) for skill, count in analytics["top_skills"]],
    )


@router.get("/analytics/skill-heatmap", response_model=SkillHeatmapResponse)
def get_skill_heatmap(
    companies: Annotated[str, Query(min_length=1)],
    skills: Annotated[str, Query(min_length=1)],
    location_city: str | None = None,
    location_country: str | None = None,
    location_mode: str | None = None,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> SkillHeatmapResponse:
    company_list = [c.strip() for c in companies.split(",") if c.strip()]
    skill_list = [s.strip() for s in skills.split(",") if s.strip()]
    if len(company_list) == 1:
        row = repo.fetch_skill_heatmap_row(
            company_list[0], skill_list,
            location_city=location_city,
            location_country=location_country,
            location_mode=location_mode,
        )
        return SkillHeatmapResponse(matrix={company_list[0]: row})
    matrix = repo.fetch_skill_heatmap(company_list, skill_list)
    return SkillHeatmapResponse(matrix=matrix)


@router.get("/companies/pulse", response_model=CompanyPulseResponse)
def get_company_pulse(
    companies: Annotated[str, Query(min_length=1)],
    repo: CompanySignalsRepository = Depends(get_company_signals_repository),
) -> CompanyPulseResponse:
    """Demand pulse for a set of companies (Signal Thread S2). Public — the
    compare strip + directory read it. Capped at 20 companies (the compare-slot
    ceiling is 10; the directory pages its visible cards)."""
    names = [c.strip() for c in companies.split(",") if c.strip()][:20]
    if not names:
        return CompanyPulseResponse(companies=[])
    rows = repo.pulse_for(names)
    return CompanyPulseResponse(companies=[CompanyPulseItem(**r) for r in rows])


@router.get("/companies/indexable", response_model=IndexableCompaniesResponse)
def get_indexable_companies(
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> IndexableCompaniesResponse:
    """Companies whose detail page renders real content (>=1 live listing) — the
    SEO-indexing allowlist the sitemap reads (Fix 1, 2026-07-23 GSC report). A
    company with only delisted/unverified rows is a thin page Google crawls then
    drops; emitting only these keeps the sitemap honest and protects crawl
    budget. Public, cached 1h. A cold cache failure is explicitly unavailable,
    never silently represented as an empty directory."""
    try:
        rows = repo.fetch_indexable_companies()
    except APIError:
        return IndexableCompaniesResponse(companies=[], status="unavailable")
    return IndexableCompaniesResponse(
        companies=[IndexableCompanyItem(**r) for r in rows]
    )


@router.get("/companies/gap-signals", response_model=CompanyGapSignalsResponse)
def get_company_gap_signals(
    companies: Annotated[str, Query(min_length=1)],
    skills: Annotated[str, Query(min_length=1)],
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> CompanyGapSignalsResponse:
    """New-this-week (company × skill) role counts — the /intel gap-alert signal
    (S3). Public. The frontend passes the user's followed companies + their
    Gap/Building skills; the strip surfaces the strongest match."""
    company_list = [c.strip() for c in companies.split(",") if c.strip()][:20]
    skill_list = [s.strip() for s in skills.split(",") if s.strip()][:40]
    if not company_list or not skill_list:
        return CompanyGapSignalsResponse(signals=[])
    matrix = repo.fetch_new_role_skill_counts(company_list, skill_list)
    signals = [
        CompanyGapSignalItem(company_name=company, skill=skill, new_roles=count)
        for company, row in matrix.items()
        for skill, count in row.items()
        if count > 0
    ]
    signals.sort(key=lambda s: s.new_roles, reverse=True)
    return CompanyGapSignalsResponse(signals=signals)


@router.get("/analytics/skills", response_model=EntitySkillsResponse)
def get_entity_skills(
    entity: str,
    type: str = "company",
    location_city: str | None = None,
    location_country: str | None = None,
    location_mode: str | None = None,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> EntitySkillsResponse:
    skills = repo.fetch_entity_skills(
        entity_name=entity,
        entity_type=type,
        location_city=location_city,
        location_country=location_country,
        location_mode=location_mode,
    )
    return EntitySkillsResponse(
        entity=entity,
        type=type,
        skills=[SkillCountItem(skill=s["skill"], count=s["count"]) for s in skills],
    )


@router.get("/analytics", response_model=MarketAnalyticsSummaryResponse)
def get_market_analytics(
    role_domain: str | None = None,
    location_city: str | None = None,
    location_country: str | None = None,
    location_mode: str | None = None,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> MarketAnalyticsSummaryResponse:
    analytics = repo.compile_market_analytics(
        role_domain=role_domain,
        location_city=location_city,
        location_country=location_country,
        location_mode=location_mode,
    )
    return MarketAnalyticsSummaryResponse(
        total_jobs=analytics["total_jobs"],
        total_companies=analytics["total_companies"],
        total_industries=analytics["total_industries"],
        latest_batch=analytics["latest_batch"],
        scraper_started=analytics.get("scraper_started"),
        total_jobs_today=analytics.get("total_jobs_today", 0),
        jobs_added_1h=analytics.get("jobs_added_1h", 0),
        companies_added_7d=analytics.get("companies_added_7d", 0),
        by_company=[
            NameCountItem(
                name=name,
                count=count,
                last_seen_at=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("last_seen_at"),
                velocity_bins=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("velocity_bins"),
                country=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("country"),
                industry=(analytics.get("by_company_enrichment", {}).get(name) or {}).get("industry"),
            )
            for name, count in analytics["by_company"]
        ],
        by_industry=[NameCountItem(name=name, count=count) for name, count in analytics["by_industry"]],
        by_role=[NameCountItem(name=name, count=count) for name, count in analytics["by_role"]],
        by_location_city=[NameCountItem(name=name, count=count) for name, count in analytics["by_location_city"]],
        by_location_country=[NameCountItem(name=name, count=count) for name, count in analytics["by_location_country"]],
        by_location_mode=[NameCountItem(name=name, count=count) for name, count in analytics["by_location_mode"]],
        industry_roles={
            industry: [NameCountItem(name=name, count=count) for name, count in roles]
            for industry, roles in analytics.get("industry_roles", {}).items()
        },
        top_skills=[SkillCountItem(skill=skill, count=count) for skill, count in analytics["top_skills"]],
    )


@router.get("/search", response_model=JobSearchResponse)
def search_jobs(
    company: Annotated[str, Query(min_length=1)],
    skill: Annotated[str, Query(min_length=1)],
    role_domain: str | None = None,
    location_city: str | None = None,
    location_country: str | None = None,
    location_mode: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> JobSearchResponse:
    # Company × skill drill-down → canonical FilterSpec → tuned SQL (Consolidation C).
    spec = FilterSpec(
        company=company,
        skill_facet=skill,
        role_domain=role_domain,
        location_city=location_city,
        location_country=location_country,
        location_mode=location_mode,
        page=page,
        page_size=page_size,
    )
    page_result = JobQuery.company_drill(repo, spec)
    items = [
        JobSearchItem(
            job_id=row["job_id"],
            job_title=row.get("job_title") or "",
            company_name=row.get("company_name"),
            job_description=row.get("job_description"),
            location=row.get("location"),
            location_city=row.get("location_city"),
            location_country=row.get("location_country"),
            location_mode=row.get("location_mode"),
            location_quality=row.get("location_quality"),
        )
        for row in page_result["rows"]
    ]
    return JobSearchResponse(
        jobs=items,
        available_total=page_result["available_total"],
        returned_total=page_result["returned_total"],
        page=page_result["page"],
        page_size=page_result["page_size"],
        has_next_page=page_result["has_next_page"],
    )


@dataclass(frozen=True)
class _ShortlistContext:
    """The only per-user state the finite list needs: the CV skills that mark a
    card's chips matched, and the target roles that decide role-family match.

    Retrieval does the rest in SQL — level, direction, location, the employer cap
    and the draining queue are all inside `candidates_for_user`, so no exclusion
    set, follow set or location pref crosses the wire any more. The seven-read
    prelude this replaces is why `/jobs/feed` sat at ~550ms."""

    skill_keys: set[str]
    target_roles: list[str]


def _shortlist_context(repo: JobsRepository, uid: str) -> _ShortlistContext:
    got: dict[str, object]
    if hasattr(repo, "get_feed_context"):
        got = repo.get_feed_context()
    else:
        # Compatibility seam for lightweight repository fakes. Production uses
        # current_user_feed_context(), which answers both in one hop.
        got = run_concurrently(
            {
                "skill_keys": lambda: repo.user_skill_keys(uid),
                "target_roles": lambda: repo.get_user_target_roles(uid),
            },
            label="jobs.shortlist.context",
        )
    return _ShortlistContext(
        skill_keys=set(got.get("skill_keys") or ()),
        target_roles=list(got.get("target_roles") or []),
    )


def _rank_feed_rows(rows: list[dict], brain_evals: dict[str, dict], *, reorder: bool) -> int:
    """Attach cached Matching-Brain badges + the Match Verdict to each card, and —
    when the user asked to be ranked by fit — float the brain-ranked cards to the
    front ordered by verdict (best first). The long tail keeps its deterministic fit
    order. Returns how many leading cards now carry a verdict — the feed draws its
    "more roles" divider after this many.

    `reorder=False` attaches the same badges and changes NOTHING about the order.
    This used to reorder unconditionally, so a user who picked "Newest" got
    warmed-cards-first instead of newest-first: the toggle was wrong on both of its
    two settings. Verdicts still show on every card either way — the badge is
    information, the order is the user's instruction, and the two are not the same
    decision. Returns 0 when not reordering: there is no leading ranked block, so
    there is no divider to draw.

    No LLM here: a card only ranks if the brain already warmed it for this user.
    """
    ranked: list[tuple[int, int, int, dict]] = []
    tail: list[dict] = []
    for r in rows:
        ev = brain_evals.get(str(r.get("job_id")))
        if not ev:
            tail.append(r)
            continue
        r["overall_score"] = ev.get("overall_score")
        r["grade"] = ev.get("grade")
        r["recommendation"] = ev.get("recommendation")
        r["legitimacy_tier"] = ev.get("legitimacy_tier")
        r["legitimacy_reason"] = ev.get("legitimacy_reason")
        r["archetype"] = ev.get("archetype")
        # Which of the user's searches found this. NULL for the 83% with one.
        r["track_id"] = ev.get("track_id")
        # The Match Verdict is derived server-side from the eval (never in the
        # client): the one "how good / what to do" read every surface shares.
        me = MatchEval.model_validate(ev)
        r["match_score"] = me.match_score
        r["verdict"] = me.verdict
        r["is_strong"] = me.is_strong
        # Sorted on (which search, read?, score) — see the sort below.
        # A NULL track is track 1, the profile, and sorts first; stored tracks
        # follow by id, which is their open order. (Position, not id, is the
        # user's own order, and the two differ only after a track is archived
        # and its slot reused — a 3-track edge case not worth a second DB read
        # on the feed's J0 path to resolve.)
        track = ev.get("track_id")
        ranked.append((
            0 if track is None else int(track),
            1 if ev.get("overall_score") is not None else 0,
            me.match_score,
            r,
        ))
    if not reorder:
        return 0
    # BY SEARCH, then read rows first, then best verdict; ties keep the incoming
    # fit order (stable sort on a pre-fit-ordered list). Rank down, never hide —
    # a "stretch"/"skip" card still appears, just below the strong ones.
    #
    # Grouping by search comes FIRST because cross-search ranking answers a
    # question nobody asked: a consulting job and a marketing job were never
    # competing for one slot, and interleaving them by score is what would make
    # "Best fit" a lie for someone running two searches. For the 83% with one
    # search every `track_id` is NULL, the first term is constant, and this sort
    # is byte-identical to the one before tracks existed.
    #
    # The read/unread half of the key is not cosmetic. `MatchEval.match_score` is
    # the brain's `overall_score / 5 * 100` once the brain has run and RAW
    # `overlap_score` before it — two different scales in one field. So an
    # unevaluated row with generous overlap (82) outranked an evaluated one the
    # brain scored 3.5/5 (70), which is precisely the "82% shouts but it's a bad
    # match" defect the brain spine exists to fix, reappearing in the ordering.
    #
    # It barely bit while `feed/warm` warmed almost every ranked card. Job Tracks
    # makes it permanent: a run keeps TRACK_QUOTA (20) per search and deep-evals
    # only TRACK_DEEP (8), so twelve rows in twenty never carry a brain score at
    # all — and would have floated over the eight that do.
    # Ascending, with the two "best first" terms negated — a single `reverse`
    # would also reverse the track order and put the last search first.
    ranked.sort(key=lambda row: (row[0], -row[1], -row[2]))
    # No eval is the same provisional state a persisted match uses before the
    # brain reads it (`verdict: "checking"`). Leaving the key absent is how
    # retrieval order was presented as a ranking: ranked_count 0, no verdict,
    # and the client drew no read/unread divider. Order is unchanged — rank
    # down, never hide, and this is not a second ordering.
    for row in tail:
        row["verdict"] = "checking"
    rows[:] = [r for _, _, _, r in ranked] + tail
    return len(ranked)


@router.get("/feed", response_model=JobFeedResponse)
def job_feed(
    background_tasks: BackgroundTasks,
    repo: JobsRepository = Depends(get_token_jobs_repository),
    principal: Principal = Depends(get_principal),
) -> JobFeedResponse:
    """The authed /market list: every job this person should see, and nothing else.

    Takes no parameters, and that is the change. It used to take eleven — a sort
    lens, a cluster pin, free text, a skill facet, three location fields, a skill
    floor, a follow toggle, a stretch toggle, an expansion tier and a page — and
    behind them it sampled 500 rows ordered by a date 88% of the corpus shared,
    then filtered THOSE for the user. One person's entire feed was 34 jobs out of
    38,824 live listings and her Match Quality recall was 0%.

    Now `candidates_for_user` filters the whole corpus per user first and ranks
    what survives, capped at `SHORTLIST_SIZE`. On a finite list every narrowing the
    filters sheet offered is a view filter over forty cards the client already
    holds, so none of it belongs on the wire. Corpus-wide search is a different
    act and it is Myro Search's surface, not this one.
    """
    uid = principal.id
    with phase_timer("jobs.feed") as timed:
        with timed("context"):
            ctx = _shortlist_context(repo, uid)
        with timed("retrieve"):
            rows = repo.shortlist_jobs(
                uid, skill_keys=ctx.skill_keys, target_roles=ctx.target_roles
            )
        # Brain-everywhere (Consolidation D): attach the cached Matching-Brain badges
        # + the Match Verdict from ONE batched read, and float the ranked cards to the
        # front (the "best jobs" rule). No LLM at read time — a card only ranks if the
        # brain already warmed it for this user (POST /feed/warm, a refresh, or an open).
        feed_job_ids = [str(r.get("job_id")) for r in rows if r.get("job_id")]
        with timed("evals"):
            brain_evals = repo.get_cached_match_evals(uid, feed_job_ids) if feed_job_ids else {}
        # One order now, and it is best-first, so the brain's verdict always leads.
        # This used to reorder only when the user picked the "fit" lens; there is no
        # lens to pick.
        with timed("rank"):
            ranked_count = _rank_feed_rows(rows, brain_evals, reorder=True)
        # Nobody has been read yet. The rows are marked checking and the client
        # draws the unread divider; this log is the rate of that state. Expected
        # on a cold arrival (the warm is still on the lane). A sustained rate
        # means the warm is failing or never firing.
        if ranked_count == 0 and rows:
            logger.warning("metric feed.unranked user=%s rows=%d", uid, len(rows))
        # Analytics/audit write: never make the J0 read wait for it. Starlette runs
        # this after the response is sent, matching /jobs/matches' existing seam.
        background_tasks.add_task(
            repo.record_recommendation_exposures, uid, rows, surface="market"
        )
        with timed("serialize"):
            items = [JobFeedItem(**row) for row in rows]
    return JobFeedResponse(
        jobs=items,
        shortlist_size=repo.SHORTLIST_SIZE,
        ranked_count=ranked_count,
    )


@router.post("/feed/warm", response_model=FeedWarmResponse)
async def warm_feed(
    principal: Principal = Depends(get_principal),
) -> FeedWarmResponse:
    """Queue a ranking of the /market shortlist. This request does not rank.

    It used to await the career-ops brain here: ten jobs, three at a time, up
    to 45s each, ~100s measured, while the client gave up at 7s and treated
    the abandonment as "nothing was warmed". The ranked rows then landed after
    the user had gone. The work is the `feed_warm` Background Job on the fast
    lane (a user is looking at this list). GET /jobs/feed is the Durable
    Answer: `ranked_count` says how many rows are read, and unread rows carry
    `verdict: "checking"`.

    A live match run still yields the lane. Idempotent within the claim
    window: a second POST while one is in flight reports pending and does not
    enqueue another.
    """
    uid = principal.id
    if user_has_live_refresh(uid):
        logger.info("metric feed_warm.yielded user=%s stage=route", uid)
        return FeedWarmResponse(ready=True, warmed=0, pending=False)
    return FeedWarmResponse(ready=True, warmed=0, pending=feed_warm.enqueue_feed_warm(uid))


@router.post("/feed/{job_id}/skip", status_code=status.HTTP_204_NO_CONTENT)
def skip_feed_job(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> None:
    """Skip a job from the triage feed → it stops appearing here and in the
    dashboard match stack (one canonical rejection signal). Reversible via DELETE."""
    repo.dismiss_dashboard_job_card(principal.id, job_id)


@router.delete("/feed/{job_id}/skip", status_code=status.HTTP_204_NO_CONTENT)
def unskip_feed_job(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> None:
    """Undo a Skip (the 5s 'Skipped · Undo' toast)."""
    repo.undismiss_job_card(principal.id, job_id)


@router.get("/at/{company}", response_model=CompanyOpenRolesResponse)
def list_company_open_roles(
    company: str,
    limit: Annotated[int, Query(ge=1, le=50)] = 6,
    location_country: str | None = None,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> CompanyOpenRolesResponse:
    """Public — latest N roles at a company. Powers /intel Open Roles panel."""
    rows = repo.list_jobs_at_company(company, limit=limit, location_country=location_country)
    return CompanyOpenRolesResponse(
        company=company,
        jobs=[
            CompanyOpenRoleItem(
                job_id=str(r["job_id"]),
                job_title=r.get("job_title") or "",
                location_city=r.get("location_city"),
                location_country=r.get("location_country"),
                location_mode=r.get("location_mode"),
                # Age = the company's actual posting date (date_posted). first_seen/
                # last_seen are OUR crawl markers — a fresh crawl batch writes them
                # ≈now, so using them made every role read a misleading "0m ago".
                # Fall back to crawl markers only when date_posted is NULL (legacy rows).
                created_at=_job_feed_marker_to_iso(
                    r.get("date_posted") or r.get("first_seen") or r.get("last_seen")
                ),
            )
            for r in rows
        ],
    )


@router.get("/companies-at", response_model=TopCompaniesAtResponse)
def list_top_companies_at(
    industry: str | None = None,
    city: str | None = None,
    sort_by: Literal["roles", "last_seen"] = "roles",
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> TopCompaniesAtResponse:
    """Public — top companies hiring in an industry group or city.

    Powers the /intel Industries/Cities right panel. Exactly one of
    industry/city must be provided.
    """
    industry = (industry or "").strip() or None
    city = (city or "").strip() or None
    if bool(industry) == bool(city):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide exactly one of industry or city.",
        )
    rows = repo.list_top_companies_at(industry=industry, city=city, limit=limit, sort_by=sort_by)
    return TopCompaniesAtResponse(
        kind="industry" if industry else "city",
        value=industry or city or "",
        companies=[
            CompanyHiringItem(
                company_name=r["company_name"],
                open_count=r["open_count"],
                location_country=r.get("location_country"),
                last_seen_at=r.get("last_seen_at"),
            )
            for r in rows
        ],
    )


@router.get("/search/global", response_model=GlobalJobSearchResponse)
def global_search_jobs(
    q: Annotated[str, Query(min_length=2, max_length=100)],
    limit: Annotated[int, Query(ge=1, le=50)] = 12,
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> GlobalJobSearchResponse:
    """Public — trigram search across job_title + company_name. Powers ⌘K."""
    rows = repo.global_job_search(q, limit=limit)
    return GlobalJobSearchResponse(
        query=q,
        hits=[
            GlobalJobHit(
                job_id=str(r["job_id"]),
                job_title=r.get("job_title") or "",
                company_name=r.get("company_name"),
                location_city=r.get("location_city"),
                location_country=r.get("location_country"),
                location_mode=r.get("location_mode"),
                created_at=_job_feed_marker_to_iso(r.get("first_seen")),
            )
            for r in rows
        ],
    )
