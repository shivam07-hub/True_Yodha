import logging
from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from postgrest.exceptions import APIError

from app.deps import Principal, get_principal
from app.repositories.jobs import (
    CompanySearchUnavailable,
    JobsRepository,
    _job_feed_marker_to_iso,
    get_public_jobs_repository,
    get_token_jobs_repository,
)
from app.repositories.search_queries import SearchQueriesRepository
from app.services.concurrent_reads import run_concurrently
from app.services.llm_provider import LLMProvider, get_blocking_judgment_provider
from app.services.matching import feed_warm
from app.services.matching.filter_spec import FilterSpec
from app.services.matching.job_query import JobQuery
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
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> CompanyPulseResponse:
    """Demand pulse for a set of companies (Signal Thread S2). Public — the
    compare strip + directory read it. Capped at 20 companies (the compare-slot
    ceiling is 10; the directory pages its visible cards)."""
    names = [c.strip() for c in companies.split(",") if c.strip()][:20]
    if not names:
        return CompanyPulseResponse(companies=[])
    rows = repo.fetch_company_pulse(names)
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
class _FeedScope:
    """Resolved feed query: the canonical FilterSpec plus the per-user context the
    feed read needs. Built once from the request so the GET /feed read and the
    POST /feed/warm shortlist rank the SAME jobs in the SAME scope (a warmed card
    must be exactly a card the feed shows)."""

    spec: FilterSpec
    skill_keys: set[str]
    target_roles: list[str]
    exclude_ids: set[str]
    followed: set[str] | None
    location_countries: list[str]
    resolved_domain: str | None
    primary_career_band: str | None
    explored_career_bands: list[str]
    target_seniority: str


def _resolve_feed_scope(
    repo: JobsRepository,
    uid: str,
    *,
    cluster: str | None,
    role_domain: str | None,
    q: str | None,
    skill: str | None,
    location_city: str | None,
    location_country: str | None,
    location_mode: str | None,
    sort: str,
    min_skill_matches: int,
    following_only: bool,
    include_stretch: bool,
    browse_scope: str,
    page: int,
    page_size: int,
) -> _FeedScope:
    # The feed prelude is ~6 independent reads (skill keys, target roles, the two
    # exclusion sets, location prefs, optionally followed companies + role-domain
    # resolution). Run them concurrently instead of serially — wall time collapses
    # from sum() (the prod `route.slow` on /jobs/feed) to max(). Same per-request
    # RLS client (Depends-cached, httpx threadsafe) as the parallel home bootstrap.
    got: dict[str, object] = {}
    if hasattr(repo, "get_feed_context"):
        got = repo.get_feed_context()
        extra_reads = {}
    else:
        # Compatibility seam for lightweight repository fakes. Production uses
        # current_user_feed_context(), collapsing these seven hops into one.
        extra_reads = {
            "skill_keys": lambda: repo.user_skill_keys(uid),
            "target_roles": lambda: repo.get_user_target_roles(uid),
            "dismissed": lambda: repo.get_dismissed_job_card_ids(uid),
            "saved": lambda: repo.get_saved_job_ids(uid),
            "location_prefs": lambda: repo.user_target_locations(uid),
            "location_countries": lambda: repo.user_target_location_countries(uid),
        }
        if hasattr(repo, "get_user_eligibility_preferences"):
            extra_reads["eligibility"] = lambda: repo.get_user_eligibility_preferences(uid)
    if following_only:
        extra_reads["followed"] = lambda: repo.get_followed_company_names(uid)
    if not role_domain and cluster:
        extra_reads["resolved_domain"] = lambda: repo.resolve_role_domain_for_clusters([cluster])
    if extra_reads:
        # Through `run_concurrently`, not a per-request ThreadPoolExecutor. The raw
        # pool here was invisible (no `fanout.slow` line), uncounted against the
        # read contract's 3-section budget, and outside the one process-wide pool
        # that exists precisely so a burst cannot multiply threads by
        # requests × sections against the 40-read bulkhead. In production this is
        # 0-2 sections — `get_feed_context()` collapses the six-read compat path
        # into one RPC — so this is about visibility and the shared pool, not
        # width. The six-section branch below is the lightweight-fake path.
        got.update(run_concurrently(extra_reads, label="jobs.feed.prelude"))

    resolved_domain = role_domain or got.get("resolved_domain")
    # Draining queue: hide what the user has decided on. Skipped = the canonical
    # rejection table (shared with the dashboard); saved = any application row.
    exclude_ids = set(got["dismissed"]) | set(got["saved"])
    # Geo is fixed from settings: scope the feed to the user's saved location
    # preferences instead of re-asking. The legacy city/country query params stay
    # for back-compat but the market UI no longer sends them.
    #
    # `location_mode` is different — it IS a live user filter (the Work mode
    # control in the filters sheet), so it must NOT disable the browse-scope
    # expansion ladder. A user asking for remote roles still deserves the widen
    # to country when their exact locations run dry; their chosen mode simply
    # rides along through each tier.
    location_countries = got["location_countries"]
    effective_location_prefs = got["location_prefs"]
    effective_location_country = location_country
    effective_location_mode = location_mode
    if not any((location_city, location_country)) and location_countries:
        if browse_scope == "remote_country":
            effective_location_prefs = []
            effective_location_country = location_countries[0]
            effective_location_mode = location_mode or "remote"
        elif browse_scope == "country":
            effective_location_prefs = []
            effective_location_country = location_countries[0]
            effective_location_mode = location_mode
    followed: set[str] | None = got.get("followed") if following_only else None
    eligibility = got.get("eligibility") or {
        "target_career_band": None,
        "explored_career_bands": [],
        "target_seniority": "any",
    }
    # Canonical FilterSpec (Consolidation C): the user-expressed query dimensions.
    # Personal context (CV skills, target roles, exclusions, follow set) is injected
    # at resolve time by JobQuery.feed, not carried on the spec. Delegates to the
    # tuned feed_jobs SQL unchanged.
    spec = FilterSpec(
        role_domain=resolved_domain,
        q=q,
        skill_facet=skill,
        location_city=location_city,
        location_country=effective_location_country,
        location_mode=effective_location_mode,
        location_prefs=tuple(effective_location_prefs) if effective_location_prefs is not None else None,
        sort=sort,
        min_skill_matches=min_skill_matches,
        following_only=following_only,
        include_stretch=include_stretch,
        page=page,
        page_size=page_size,
    )
    return _FeedScope(
        spec=spec,
        skill_keys=got["skill_keys"],
        target_roles=got["target_roles"],
        exclude_ids=exclude_ids,
        followed=followed,
        location_countries=location_countries,
        resolved_domain=resolved_domain,
        primary_career_band=eligibility["target_career_band"],
        explored_career_bands=eligibility["explored_career_bands"],
        target_seniority=eligibility["target_seniority"],
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
    ranked: list[tuple[int, dict]] = []
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
        # The Match Verdict is derived server-side from the eval (never in the
        # client): the one "how good / what to do" read every surface shares.
        me = MatchEval.model_validate(ev)
        r["match_score"] = me.match_score
        r["verdict"] = me.verdict
        r["is_strong"] = me.is_strong
        ranked.append((me.match_score, r))
    if not reorder:
        return 0
    # Best verdict first; ties keep the incoming fit order (stable sort on a
    # pre-fit-ordered list). Rank down, never hide — a "stretch"/"skip" card still
    # appears, just below the strong ones.
    ranked.sort(key=lambda pair: pair[0], reverse=True)
    rows[:] = [r for _, r in ranked] + tail
    return len(ranked)


@router.get("/feed", response_model=JobFeedResponse)
def job_feed(
    background_tasks: BackgroundTasks,
    cluster: str | None = None,
    role_domain: str | None = None,
    q: str | None = None,
    skill: str | None = None,
    location_city: str | None = None,
    location_country: str | None = None,
    location_mode: str | None = None,
    sort: str = "fresh",
    min_skill_matches: Annotated[int, Query(ge=0, le=20)] = 0,
    following_only: bool = False,
    include_stretch: bool = False,
    browse_scope: Literal["exact", "remote_country", "country"] = "exact",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
    repo: JobsRepository = Depends(get_token_jobs_repository),
    principal: Principal = Depends(get_principal),
) -> JobFeedResponse:
    """Authed /market triage feed. Company-agnostic, filterable, paginated.

    Resolves a target-role `cluster` (or explicit `role_domain`) to a jobs.role_domain
    filter. Always computes the user's CV-skill overlap + target-role match so every
    card shows its fit; the `fit` sort blends those signals and the min_skill_matches
    filter narrows on skill overlap. The feed excludes jobs the user has already saved
    or skipped (draining-queue model) so they only ever see roles they have not yet
    decided on.
    """
    # The feed prelude is ~6 independent reads (skill keys, target roles, the two
    # exclusion sets, location prefs, optionally followed companies + role-domain
    # resolution). Run them concurrently instead of serially — wall time collapses
    # from sum() (the prod `route.slow` on /jobs/feed) to max(). Same per-request
    # RLS client (Depends-cached, httpx threadsafe) as the parallel home bootstrap.
    uid = principal.id
    # Sequential phases, so wall time is sum(phase) and every one is worth a
    # number. Instrumented because this endpoint was invisible: ~550ms sits under
    # `route.slow`'s 1000ms, and the prelude used a raw ThreadPoolExecutor so no
    # `fanout.slow` line existed either. A feed precompute (R2) was scoped on an
    # assumption about where that time goes; grep `metric phases.slow
    # label=jobs.feed` for the answer before building one.
    with phase_timer("jobs.feed") as timed:
        with timed("prelude"):
            scope = _resolve_feed_scope(
                repo, uid,
                cluster=cluster, role_domain=role_domain, q=q, skill=skill,
                location_city=location_city, location_country=location_country, location_mode=location_mode,
                sort=sort, min_skill_matches=min_skill_matches, following_only=following_only, include_stretch=include_stretch,
                browse_scope=browse_scope, page=page, page_size=page_size,
            )
        location_countries = scope.location_countries
        with timed("query"):
            page_result = JobQuery.feed(
                repo,
                scope.spec,
                user_skill_keys=scope.skill_keys,
                user_target_roles=scope.target_roles,
                primary_career_band=scope.primary_career_band,
                explored_career_bands=scope.explored_career_bands,
                target_seniority=scope.target_seniority,
                exclude_job_ids=scope.exclude_ids,
                followed_companies=scope.followed,
            )
        # Log a deliberate text search once (page 1) — the authed intent signal.
        # Best-effort: SearchQueriesRepository swallows any failure. Pagination and
        # filter-only loads (no q) are skipped to keep the signal clean.
        if q and q.strip() and page == 1:
            with timed("search_log"):
                SearchQueriesRepository.record(
                    surface="market",
                    query=q.strip(),
                    user_id=uid,
                    parsed={"skill": skill, "role_domain": scope.resolved_domain, "sort": sort},
                    result_count=page_result["available_total"],
                )
        rows = page_result["rows"]
        # Brain-everywhere (Consolidation D): attach the cached Matching-Brain badges +
        # the Match Verdict from ONE batched read, and float the ranked cards to the
        # front (the "best jobs" rule). No LLM at feed time — a card only ranks if the
        # brain already warmed it for this user (POST /feed/warm, a refresh, or an open);
        # the rest stay deterministic-overlap browse rows below the divider.
        feed_job_ids = [str(r.get("job_id")) for r in rows if r.get("job_id")]
        with timed("evals"):
            brain_evals = repo.get_cached_match_evals(uid, feed_job_ids) if feed_job_ids else {}
        # Reorder only when the user asked to be ranked by fit. `page_result["sort"]` is
        # the resolved mode (the server may fall back when a user has no fit signal), not
        # the raw query param — the order must follow what was actually applied.
        with timed("rank"):
            ranked_count = _rank_feed_rows(rows, brain_evals, reorder=page_result["sort"] == "fit")
        # Analytics/audit write: never make the J0 feed wait for it. Starlette runs
        # this after the response is sent, matching /jobs/matches' existing seam.
        background_tasks.add_task(
            repo.record_recommendation_exposures, uid, rows, surface="market"
        )
        with timed("serialize"):
            items = [JobFeedItem(**row) for row in rows]
    return JobFeedResponse(
        jobs=items,
        available_total=page_result["available_total"],
        returned_total=page_result["returned_total"],
        page=page_result["page"],
        page_size=page_result["page_size"],
        has_next_page=page_result["has_next_page"],
        sort=page_result["sort"],
        ranked_count=ranked_count,
        expansion_tier=browse_scope,
        expansion_label=(
            None
            if browse_scope == "exact"
            else f"More {'remote ' if browse_scope == 'remote_country' else ''}roles in {location_countries[0]}"
            if location_countries
            else None
        ),
    )


@router.post("/feed/warm", response_model=FeedWarmResponse)
async def warm_feed(
    cluster: str | None = None,
    role_domain: str | None = None,
    q: str | None = None,
    skill: str | None = None,
    location_city: str | None = None,
    location_country: str | None = None,
    location_mode: str | None = None,
    following_only: bool = False,
    include_stretch: bool = False,
    browse_scope: Literal["exact", "remote_country", "country"] = "exact",
    repo: JobsRepository = Depends(get_token_jobs_repository),
    principal: Principal = Depends(get_principal),
    provider: LLMProvider = Depends(get_blocking_judgment_provider),
) -> FeedWarmResponse:
    """Rank the top of the /market feed with the career-ops brain (the "best jobs"
    rule). The frontend calls this while showing a skeleton, then re-reads GET /feed
    — the top cards now carry a verdict + move, ordered best-first.

    ONE batched brain pass over the fit-top shortlist on the BLOCKING JUDGMENT lane
    (strong-only, paid-first), cached into `user_job_matches` for 30 min. It ran on
    `get_interactive_provider` until 2026-08-04, whose lead tier is
    `google/gemma-3-4b-it` — the model `_JUDGMENT_UNSAFE_MODELS` names for ranking
    banker jobs to a senior SWE with zero errors. Deciding which ten cards a user
    sees first is the definition of a judgment call, and the user is watching a
    skeleton while it runs, so paid-strong leads. Idempotent (a re-warm inside the
    window is free)
    and fail-soft (any brain failure returns ready=True/warmed=0 and the feed paints
    the deterministic order). Scoped to the SAME filters as the feed so the warmed
    cards are exactly the cards the user sees first."""
    uid = principal.id
    scope = _resolve_feed_scope(
        repo, uid,
        cluster=cluster, role_domain=role_domain, q=q, skill=skill,
        location_city=location_city, location_country=location_country, location_mode=location_mode,
        # The brain ranks the fit-top shortlist regardless of the user's chosen sort
        # lens — "Best fit" is the surface the warm powers.
        sort="fit", min_skill_matches=0, following_only=following_only, include_stretch=include_stretch,
        browse_scope=browse_scope, page=1, page_size=feed_warm.SHORTLIST_SIZE,
    )
    page_result = JobQuery.feed(
        repo,
        scope.spec,
        user_skill_keys=scope.skill_keys,
        user_target_roles=scope.target_roles,
        primary_career_band=scope.primary_career_band,
        explored_career_bands=scope.explored_career_bands,
        target_seniority=scope.target_seniority,
        exclude_job_ids=scope.exclude_ids,
        followed_companies=scope.followed,
    )
    candidate_ids = [str(r["job_id"]) for r in page_result["rows"] if r.get("job_id")]
    try:
        warmed = await feed_warm.warm_feed_shortlist(repo, provider, uid, candidate_ids)
    except Exception:
        # Degradation, not an error: the feed still paints deterministic overlap.
        logger.warning("metric feed_warm.failed user=%s candidates=%d", uid, len(candidate_ids), exc_info=True)
        return FeedWarmResponse(ready=True, warmed=0)
    return FeedWarmResponse(ready=True, warmed=warmed)


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
