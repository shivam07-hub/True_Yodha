from __future__ import annotations

import time
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import Depends
from postgrest.exceptions import APIError
from supabase import Client

from app.database import get_supabase_admin
from app.deps import get_user_db
from app.repositories.job_skills_read_model import fetch_all_rows, fetch_job_skill_rows, fetch_job_skill_rows_for_ids, group_job_skill_rows
from app.services.industry_grouping import normalize_industry_group
from app.services.location_normalizer import normalize_location

SKILL_DRILL_DEFAULT_PAGE_SIZE = 50
_ANALYTICS_TTL = 7 * 24 * 3600  # 7 days — jobs scraped weekly
_SEARCH_TTL = 24 * 3600          # 1 day — job listings stale tolerance
_COMPANY_SEARCH_TTL = 24 * 3600  # 1 day — scraped companies change with the job feed
_analytics_cache: dict[tuple[str | None, str | None, str | None, str | None], tuple[float, dict[str, Any]]] = {}
_entity_skills_cache: dict[tuple[str, str, str | None, str | None, str | None], tuple[float, list[dict[str, Any]]]] = {}
_heatmap_cache: dict[tuple[frozenset[str], frozenset[str]], tuple[float, dict[str, dict[str, int]]]] = {}
_heatmap_row_cache: dict[tuple[str, frozenset[str]], tuple[float, dict[str, int]]] = {}
_skill_name_to_id_cache: dict[str, int] = {}  # display_name.lower() → skill_id; skills table is static
_search_cache: dict[tuple[str, str, str | None, str | None, str | None, str | None, int, int], tuple[float, dict[str, Any]]] = {}
_company_search_cache: dict[tuple[str, int], tuple[float, list[str]]] = {}

_FEED_TS_TTL = 5 * 60  # 5 minutes — cheap guard against repeated MAX() queries
_feed_ts_cache: tuple[float, str | None] = (0.0, None)
_COMPANY_SEARCH_RPC = "search_job_companies"


class CompanySearchUnavailable(RuntimeError):
    """Raised when the upstream company autocomplete read cannot be served."""


def _parse_iso_dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _job_feed_marker_to_iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, int):
        text = f"{value:08d}"
    else:
        text = str(value).strip()
    if len(text) == 8 and text.isdigit():
        try:
            return date(int(text[:4]), int(text[4:6]), int(text[6:8])).isoformat()
        except ValueError:
            return None
    return text or None


def _marker_to_dt(value: Any) -> datetime | None:
    """Parse a jobs feed marker (YYYYMMDD int/str) or ISO string → aware datetime.

    The `jobs` table stores first_seen / last_seen / batch_date as integer
    YYYYMMDD markers, not timestamps. Route those through the marker→ISO
    converter before ISO parsing so analytics date math works on real values.
    """
    return _parse_iso_dt(_job_feed_marker_to_iso(value))


def get_feed_updated_at(db: Client) -> str | None:
    """Returns an ISO date for the latest job feed marker. Cached 5 min."""
    global _feed_ts_cache
    cached_at, cached_value = _feed_ts_cache
    cache_initialized = cached_at > 0.0 or cached_value is not None
    if cache_initialized and (time.monotonic() - cached_at) < _FEED_TS_TTL:
        return cached_value
    try:
        result = db.table("jobs").select("last_seen").order("last_seen", desc=True).limit(1).execute()
        value = _job_feed_marker_to_iso(((result.data or [{}])[0].get("last_seen")) if result.data else None)
    except Exception:
        _feed_ts_cache = (time.monotonic(), cached_value)
        return cached_value
    _feed_ts_cache = (time.monotonic(), value)
    return value
SKILL_DRILL_MAX_PAGE_SIZE = 100
ENTITY_SKILL_LIMIT = 20


def _sorted_counter_items(counter: Counter[str]) -> list[tuple[str, int]]:
    return sorted(counter.items(), key=lambda item: (-item[1], item[0].lower(), item[0]))


def _dominant(counter: Counter[str] | None) -> str | None:
    """Most-common value in a counter, ties broken alphabetically. None if empty."""
    if not counter:
        return None
    return _sorted_counter_items(counter)[0][0]


def _bounded_page(page: int) -> int:
    return max(page, 1)


def _bounded_page_size(page_size: int) -> int:
    return max(1, min(page_size, SKILL_DRILL_MAX_PAGE_SIZE))


def _bounded_company_search_limit(limit: int) -> int:
    return max(1, min(limit, 20))


def _norm_filter(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


def _cache_key(
    role_domain: str | None,
    location_city: str | None,
    location_country: str | None,
    location_mode: str | None,
) -> tuple[str | None, str | None, str | None, str | None]:
    return (
        _norm_filter(role_domain),
        _norm_filter(location_city),
        _norm_filter(location_country),
        _norm_filter(location_mode),
    )


def _hydrate_location_fields(row: dict[str, Any]) -> None:
    city = _norm_filter(row.get("location_city"))
    country = _norm_filter(row.get("location_country"))
    mode = _norm_filter(row.get("location_mode"))
    quality = _norm_filter(row.get("location_quality"))
    raw = _norm_filter(row.get("location_raw"))
    location = _norm_filter(row.get("location"))

    if city and country and location is None:
        location = f"{city}, {country}"
    if city is not None and country is not None and quality is not None and mode is not None and location is not None:
        row["location_city"] = city
        row["location_country"] = country
        row["location_mode"] = mode
        row["location_quality"] = quality
        row["location_raw"] = raw
        row["location"] = location
        return

    parsed = normalize_location(location or raw)
    row["location"] = location or parsed.location
    row["location_raw"] = raw or parsed.location_raw
    row["location_city"] = city or parsed.location_city
    row["location_country"] = country or parsed.location_country
    row["location_mode"] = mode or parsed.location_mode
    row["location_quality"] = quality or parsed.location_quality


def _matches_location_filters(
    row: dict[str, Any],
    *,
    location_city: str | None,
    location_country: str | None,
    location_mode: str | None,
) -> bool:
    city_filter = _norm_filter(location_city)
    country_filter = _norm_filter(location_country)
    mode_filter = _norm_filter(location_mode)

    city = _norm_filter(row.get("location_city"))
    country = _norm_filter(row.get("location_country"))
    mode = _norm_filter(row.get("location_mode"))

    if city_filter and (city or "").lower() != city_filter.lower():
        return False
    if country_filter and (country or "").lower() != country_filter.lower():
        return False
    if mode_filter and (mode or "").lower() != mode_filter.lower():
        return False
    return True


class MarketAnalyticsCompiler:
    """Compiles raw market rows into deterministic analytics payloads."""

    def compile(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        company_counts: Counter[str] = Counter()
        industry_counts: Counter[str] = Counter()
        role_counts: Counter[str] = Counter()
        location_city_counts: Counter[str] = Counter()
        location_country_counts: Counter[str] = Counter()
        location_mode_counts: Counter[str] = Counter()
        skill_counts: Counter[str] = Counter()
        company_skill_counters: dict[str, Counter[str]] = {}
        industry_skill_counters: dict[str, Counter[str]] = {}
        batch_dates: list[int] = []
        company_last_seen: dict[str, datetime] = {}
        company_first_created: dict[str, datetime] = {}
        company_velocity_bins: dict[str, list[int]] = {}
        company_country_counters: dict[str, Counter[str]] = {}
        company_industry_counters: dict[str, Counter[str]] = {}
        now_utc = datetime.now(timezone.utc)
        bin_floor = (now_utc - timedelta(days=13)).replace(hour=0, minute=0, second=0, microsecond=0)
        today_floor = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        one_hr_floor = now_utc - timedelta(hours=1)
        seven_d_floor = now_utc - timedelta(days=7)
        total_jobs_today = 0
        jobs_added_1h = 0

        for row in rows:
            company = (row.get("company_name") or "").strip()
            industry = normalize_industry_group(row.get("industry_group"), row.get("industry"))
            role = (row.get("role_domain") or "").strip()
            location_city = (row.get("location_city") or "").strip()
            location_country = (row.get("location_country") or "").strip()
            location_mode = (row.get("location_mode") or "").strip()
            skills = [skill.strip() for skill in (row.get("main_skills") or []) if skill]

            created_at_dt = _marker_to_dt(row.get("first_seen"))
            # Prefer the job's own last_seen date from the jobs table; fall back to
            # the scrape/dump date (batch_date), then to first_seen. last_seen is a
            # day-granular YYYYMMDD marker, so downstream age is day-level only.
            last_seen_dt = (
                _marker_to_dt(row.get("last_seen"))
                or _marker_to_dt(row.get("batch_date"))
                or created_at_dt
            )

            if company:
                company_counts[company] += 1
                company_skill_counters.setdefault(company, Counter()).update(skills)
                if location_country:
                    company_country_counters.setdefault(company, Counter())[location_country] += 1
                if industry:
                    company_industry_counters.setdefault(company, Counter())[industry] += 1
                if last_seen_dt is not None:
                    prev = company_last_seen.get(company)
                    if prev is None or last_seen_dt > prev:
                        company_last_seen[company] = last_seen_dt
                if created_at_dt is not None:
                    prev_first = company_first_created.get(company)
                    if prev_first is None or created_at_dt < prev_first:
                        company_first_created[company] = created_at_dt
                    bins = company_velocity_bins.setdefault(company, [0] * 14)
                    delta_days = (created_at_dt - bin_floor).days
                    if 0 <= delta_days < 14:
                        bins[delta_days] += 1
            if created_at_dt is not None:
                if created_at_dt >= today_floor:
                    total_jobs_today += 1
                if created_at_dt >= one_hr_floor:
                    jobs_added_1h += 1
            if industry:
                industry_counts[industry] += 1
                industry_skill_counters.setdefault(industry, Counter()).update(skills)
            if role:
                role_counts[role] += 1
            if location_city:
                location_city_counts[location_city] += 1
            if location_country:
                location_country_counts[location_country] += 1
            if location_mode:
                location_mode_counts[location_mode] += 1
            if row.get("batch_date"):
                batch_dates.append(row["batch_date"])
            skill_counts.update(skills)

        company_skill_counts = {
            company: _sorted_counter_items(counter)[:ENTITY_SKILL_LIMIT]
            for company, counter in company_skill_counters.items()
        }
        industry_skill_counts = {
            industry: _sorted_counter_items(counter)[:ENTITY_SKILL_LIMIT]
            for industry, counter in industry_skill_counters.items()
        }
        company_skills = {
            company: [skill for skill, _ in items]
            for company, items in company_skill_counts.items()
        }
        industry_skills = {
            industry: [skill for skill, _ in items]
            for industry, items in industry_skill_counts.items()
        }

        companies_added_7d = sum(
            1 for first in company_first_created.values() if first >= seven_d_floor
        )
        company_enrichment = {
            name: {
                "last_seen_at": company_last_seen[name].isoformat()
                    if name in company_last_seen else None,
                "velocity_bins": company_velocity_bins.get(name),
                "country": _dominant(company_country_counters.get(name)),
                "industry": _dominant(company_industry_counters.get(name)),
            }
            for name in company_counts
        }
        return {
            "total_jobs": len(rows),
            "total_companies": len(company_counts),
            "total_industries": len(industry_counts),
            "latest_batch": str(max(batch_dates)) if batch_dates else None,
            "total_jobs_today": total_jobs_today,
            "jobs_added_1h": jobs_added_1h,
            "companies_added_7d": companies_added_7d,
            "by_company": _sorted_counter_items(company_counts),
            "by_company_enrichment": company_enrichment,
            "by_industry": _sorted_counter_items(industry_counts),
            "by_role": _sorted_counter_items(role_counts),
            "by_location_city": _sorted_counter_items(location_city_counts),
            "by_location_country": _sorted_counter_items(location_country_counts),
            "by_location_mode": _sorted_counter_items(location_mode_counts),
            "top_skills": _sorted_counter_items(skill_counts)[:20],
            "company_skills": company_skills,
            "industry_skills": industry_skills,
            "company_skill_counts": company_skill_counts,
            "industry_skill_counts": industry_skill_counts,
        }



class JobsRepository:
    def __init__(self, db: Client, admin_db: Client | None = None) -> None:
        self._db = db
        self._admin_db = admin_db or db  # reference-data reads bypass user-token RLS
        self._analytics_compiler = MarketAnalyticsCompiler()

    @property
    def client(self) -> Client:
        return self._db

    # ── public / global data ───────────────────────────────────────────────────

    def fetch_analytics_rows(
        self,
        role_domain: str | None = None,
        *,
        location_city: str | None = None,
        location_country: str | None = None,
        location_mode: str | None = None,
    ) -> list[dict[str, Any]]:
        def _role_filter(query: Any) -> Any:
            return query.eq("role_domain", role_domain)

        query_builder = _role_filter if role_domain else None

        jobs = fetch_all_rows(
            self._db,
            table="jobs",
            columns=(
                "job_id, company_name, industry, industry_group, role_domain, batch_date, "
                "location, location_raw, location_city, location_country, location_mode, location_quality, "
                "first_seen, last_seen"
            ),
            query_builder=query_builder,
        )

        for job in jobs:
            _hydrate_location_fields(job)

        return [
            job
            for job in jobs
            if _matches_location_filters(
                job,
                location_city=location_city,
                location_country=location_country,
                location_mode=location_mode,
            )
        ]

    def compile_market_analytics(
        self,
        role_domain: str | None = None,
        *,
        location_city: str | None = None,
        location_country: str | None = None,
        location_mode: str | None = None,
    ) -> dict[str, Any]:
        now = time.monotonic()
        cache_key = _cache_key(role_domain, location_city, location_country, location_mode)
        cached = _analytics_cache.get(cache_key)
        if cached is not None and (now - cached[0]) < _ANALYTICS_TTL:
            return cached[1]
        # Snapshot fast-path: unfiltered reads serve the precomputed payload
        # written by the scraper finalisation hook. Filtered reads fall through
        # to live compile.
        if role_domain is None and location_city is None and location_country is None and location_mode is None:
            snapshot = self._read_snapshot_payload()
            if snapshot is not None:
                _analytics_cache[cache_key] = (now, snapshot)
                return snapshot
        rows = self.fetch_analytics_rows(
            role_domain=role_domain,
            location_city=location_city,
            location_country=location_country,
            location_mode=location_mode,
        )
        payload = self._analytics_compiler.compile(rows)
        _analytics_cache[cache_key] = (now, payload)
        return payload

    def _read_snapshot_payload(self) -> dict[str, Any] | None:
        try:
            result = self._admin_db.table("market_analytics_snapshot").select("payload").eq("id", 1).limit(1).execute()
        except APIError:
            return None
        rows = result.data or []
        if not rows:
            return None
        payload = rows[0].get("payload")
        return payload if isinstance(payload, dict) else None

    def persist_analytics_snapshot(self, *, refreshed_by: str = "system") -> dict[str, Any]:
        """Recompile the unfiltered analytics payload and write it to the snapshot table.

        Called by the admin refresh endpoint after a weekly batch finalises.
        Bypasses the in-process cache so the snapshot always reflects current DB state.
        """
        rows = self.fetch_analytics_rows()
        payload = self._analytics_compiler.compile(rows)
        self._admin_db.table("market_analytics_snapshot").upsert(
            {"id": 1, "payload": payload, "refreshed_at": datetime.now(timezone.utc).isoformat(), "refreshed_by": refreshed_by},
            on_conflict="id",
        ).execute()
        # Invalidate in-process cache across all filter combos so next read hits snapshot
        _analytics_cache.clear()
        return {"total_jobs": payload["total_jobs"], "total_companies": payload["total_companies"]}

    def fetch_entity_skills(
        self,
        entity_name: str,
        entity_type: str,
        *,
        location_city: str | None = None,
        location_country: str | None = None,
        location_mode: str | None = None,
    ) -> list[dict[str, Any]]:
        now = time.monotonic()
        cache_key = (
            entity_name,
            entity_type,
            _norm_filter(location_city),
            _norm_filter(location_country),
            _norm_filter(location_mode),
        )
        cached = _entity_skills_cache.get(cache_key)
        if cached is not None and (now - cached[0]) < _ANALYTICS_TTL:
            return cached[1]

        def _entity_filter(query: Any) -> Any:
            if entity_type == "company":
                return query.eq("company_name", entity_name)
            return query.eq("industry_group", entity_name)

        entity_jobs = fetch_all_rows(
            self._db,
            table="jobs",
            columns="job_id, location_city, location_country, location_mode, location_quality",
            query_builder=_entity_filter,
        )
        for job in entity_jobs:
            _hydrate_location_fields(job)
        job_ids = [
            job["job_id"]
            for job in entity_jobs
            if _matches_location_filters(
                job,
                location_city=location_city,
                location_country=location_country,
                location_mode=location_mode,
            )
        ]
        if not job_ids:
            _entity_skills_cache[cache_key] = (now, [])
            return []

        skill_rows = fetch_job_skill_rows(
            self._db,
            columns="job_id, skills(taxonomy_key, display_name)",
            job_ids=job_ids,
        )
        skill_counter: Counter[str] = Counter()
        for row in skill_rows:
            skill = row.get("skills") or {}
            key = (skill.get("display_name") or skill.get("taxonomy_key") or "").strip()
            if key:
                skill_counter[key] += 1

        result = [{"skill": s, "count": c} for s, c in skill_counter.most_common(ENTITY_SKILL_LIMIT)]
        _entity_skills_cache[cache_key] = (now, result)
        return result

    def fetch_skill_heatmap(
        self,
        companies: list[str],
        skills: list[str],
    ) -> dict[str, dict[str, int]]:
        """Return exact job counts for (company × skill) intersections.

        Bypasses ENTITY_SKILL_LIMIT so niche user skills are not dropped.
        """
        matrix: dict[str, dict[str, int]] = {c: {s: 0 for s in skills} for c in companies}
        if not companies or not skills:
            return matrix

        cache_key = (frozenset(companies), frozenset(skills))
        now = time.monotonic()
        cached = _heatmap_cache.get(cache_key)
        if cached is not None and (now - cached[0]) < _ANALYTICS_TTL:
            return cached[1]

        job_rows = fetch_all_rows(
            self._db,
            table="jobs",
            columns="job_id, company_name",
            query_builder=lambda q: q.in_("company_name", companies),
        )
        job_company: dict[str, str] = {
            r["job_id"]: r["company_name"]
            for r in job_rows
            if r.get("job_id") and r.get("company_name")
        }
        if not job_company:
            return matrix

        skill_rows = fetch_job_skill_rows_for_ids(
            self._db,
            list(job_company.keys()),
            columns="job_id, skills(taxonomy_key, display_name)",
        )
        skill_lower_map = {s.strip().lower(): s for s in skills}
        for row in skill_rows:
            job_id = row.get("job_id")
            skill_data = row.get("skills") or {}
            company = job_company.get(job_id)
            if not company:
                continue
            key = (skill_data.get("display_name") or skill_data.get("taxonomy_key") or "").strip().lower()
            canonical = skill_lower_map.get(key)
            if canonical:
                matrix[company][canonical] += 1

        _heatmap_cache[cache_key] = (time.monotonic(), matrix)
        return matrix

    def fetch_skill_heatmap_row(
        self,
        company: str,
        skills: list[str],
        location_city: str | None = None,
        location_country: str | None = None,
        location_mode: str | None = None,
    ) -> dict[str, int]:
        """Single-company heatmap row. Filters by skill_id at DB level — avoids fetching all skills.

        Replaces the multi-company fetch_skill_heatmap for per-row incremental loading.
        Runs ~10-50× faster on first hit; subsequent hits are memory-cached.
        """
        result: dict[str, int] = {s: 0 for s in skills}
        if not company or not skills:
            return result

        cache_key = (company, frozenset(skills), location_city, location_country, location_mode)
        now = time.monotonic()
        cached = _heatmap_row_cache.get(cache_key)
        if cached is not None and (now - cached[0]) < _ANALYTICS_TTL:
            return cached[1]

        # Resolve display_names → skill IDs (module-level permanent cache; skills table is static).
        uncached_names = [s for s in skills if s.lower() not in _skill_name_to_id_cache]
        if uncached_names:
            rows = self._db.table("skills").select("id, display_name").in_("display_name", uncached_names).execute()
            for row in (rows.data or []):
                if row.get("id") and row.get("display_name"):
                    _skill_name_to_id_cache[row["display_name"].lower()] = int(row["id"])

        skill_id_to_name: dict[int, str] = {
            _skill_name_to_id_cache[s.lower()]: s
            for s in skills
            if s.lower() in _skill_name_to_id_cache
        }
        if not skill_id_to_name:
            _heatmap_row_cache[cache_key] = (time.monotonic(), result)
            return result

        skill_id_list = list(skill_id_to_name.keys())

        # Fetch job_ids for this company, with optional location filters.
        def _job_query(q):  # type: ignore[return]
            q = q.eq("company_name", company)
            if location_city:
                q = q.eq("location_city", location_city)
            if location_country:
                q = q.eq("location_country", location_country)
            if location_mode:
                q = q.eq("location_mode", location_mode)
            return q

        job_rows = fetch_all_rows(
            self._db,
            table="jobs",
            columns="job_id",
            query_builder=_job_query,
        )
        job_ids = [r["job_id"] for r in job_rows if r.get("job_id")]
        if not job_ids:
            _heatmap_row_cache[cache_key] = (time.monotonic(), result)
            return result

        # Query job_skills with BOTH job_id and skill_id filters — returns only the 8 relevant skills.
        _CHUNK = 200
        for i in range(0, len(job_ids), _CHUNK):
            chunk = job_ids[i:i + _CHUNK]
            rows = (
                self._db.table("job_skills")
                .select("skill_id")
                .in_("job_id", chunk)
                .in_("skill_id", skill_id_list)
                .execute()
            )
            for row in (rows.data or []):
                sid = row.get("skill_id")
                if sid is not None:
                    name = skill_id_to_name.get(int(sid))
                    if name:
                        result[name] = result.get(name, 0) + 1

        _heatmap_row_cache[cache_key] = (time.monotonic(), result)
        return result

    def list_jobs_at_company(
        self, company: str, *, limit: int = 6, location_country: str | None = None,
    ) -> list[dict[str, Any]]:
        """Latest N roles at a company. DB-bounded LIMIT — safe for huge companies.

        Public-surface read for the /intel Open Roles panel. No skill filter
        (use search_jobs_by_filters for skill-scoped reads). When a country filter
        is active on /intel, scope here too so both panels agree. 24h cache keyed
        on (company, country, limit) — reuses _search_cache shape, sentinel skill ''.
        """
        company_name = (company or "").strip()
        if not company_name:
            return []
        country = _norm_filter(location_country)
        scoped_limit = max(1, min(50, int(limit)))
        cache_key = (company_name, "", None, country, None, None, 1, scoped_limit)
        now = time.monotonic()
        cached = _search_cache.get(cache_key)
        if cached is not None and (now - cached[0]) < _SEARCH_TTL:
            return list(cached[1]["rows"])
        try:
            query = (
                self._admin_db
                .table("jobs")
                .select(
                    "job_id, job_title, company_name, location, location_raw, "
                    "location_city, location_country, location_mode, location_quality, "
                    "first_seen, last_seen"
                )
                .eq("company_name", company_name)
            )
            if country:
                query = query.eq("location_country", country)
            result = (
                query
                .order("first_seen", desc=True)
                .limit(scoped_limit)
                .execute()
            )
        except APIError:
            return list(cached[1]["rows"]) if cached else []
        rows = result.data or []
        for row in rows:
            _hydrate_location_fields(row)
        _search_cache[cache_key] = (now, {"rows": rows})
        return rows

    def global_job_search(self, q: str, *, limit: int = 12) -> list[dict[str, Any]]:
        """Trigram-ranked search across job_title + company_name.

        Public ⌘K surface. Index: idx_jobs_job_title_trgm + idx_jobs_company_name_trgm.
        60s in-process cache keyed on (q.lower(), limit) — debounces hot queries.
        """
        term = " ".join((q or "").split())
        if len(term) < 2:
            return []
        scoped_limit = max(1, min(50, int(limit)))
        cache_key = ("__global__", term.lower(), None, None, None, None, 1, scoped_limit)
        now = time.monotonic()
        cached = _search_cache.get(cache_key)
        if cached is not None and (now - cached[0]) < 60:
            return list(cached[1]["rows"])
        ilike = f"%{term}%"
        try:
            result = (
                self._admin_db
                .table("jobs")
                .select(
                    "job_id, job_title, company_name, location_city, location_country, "
                    "location_mode, first_seen"
                )
                .or_(f"job_title.ilike.{ilike},company_name.ilike.{ilike}")
                .order("first_seen", desc=True)
                .limit(scoped_limit)
                .execute()
            )
        except APIError:
            return list(cached[1]["rows"]) if cached else []
        rows = result.data or []
        for row in rows:
            _hydrate_location_fields(row)
        _search_cache[cache_key] = (now, {"rows": rows})
        return rows

    def search_companies(self, q: str, limit: int = 10) -> list[str]:
        search_term = " ".join(q.split())
        if not search_term:
            return []

        scoped_limit = _bounded_company_search_limit(limit)
        cache_key = (search_term.lower(), scoped_limit)
        now = time.monotonic()
        cached = _company_search_cache.get(cache_key)
        if cached is not None and (now - cached[0]) < _COMPANY_SEARCH_TTL:
            return list(cached[1])

        try:
            result = self._db.rpc(
                _COMPANY_SEARCH_RPC,
                {"search_term": search_term, "result_limit": scoped_limit},
            ).execute()
        except APIError as exc:
            if cached is not None:
                return list(cached[1])
            raise CompanySearchUnavailable("company search unavailable") from exc

        seen: set[str] = set()
        companies: list[str] = []
        for row in result.data or []:
            name = (row.get("company_name") or "").strip()
            if name and name not in seen:
                seen.add(name)
                companies.append(name)
                if len(companies) >= scoped_limit:
                    break
        _company_search_cache[cache_key] = (now, companies)
        return companies

    def search_jobs_by_filters(
        self,
        company: str,
        skill: str,
        *,
        role_domain: str | None = None,
        location_city: str | None = None,
        location_country: str | None = None,
        location_mode: str | None = None,
        page: int = 1,
        page_size: int = SKILL_DRILL_DEFAULT_PAGE_SIZE,
    ) -> dict[str, Any]:
        scoped_page = _bounded_page(page)
        scoped_page_size = _bounded_page_size(page_size)
        skill_lower = skill.strip().lower()

        cache_key = (company, skill_lower, role_domain, location_city, location_country, location_mode, scoped_page, scoped_page_size)
        now = time.monotonic()
        cached = _search_cache.get(cache_key)
        if cached is not None and (now - cached[0]) < _SEARCH_TTL:
            return cached[1]

        def _query_builder(query: Any) -> Any:
            query = query.eq("company_name", company)
            if role_domain:
                query = query.eq("role_domain", role_domain)
            return query

        rows = fetch_all_rows(
            self._db,
            table="jobs",
            columns=(
                "job_id, job_title, company_name, job_description, "
                "location, location_raw, location_city, location_country, location_mode, location_quality"
            ),
            query_builder=_query_builder,
        )

        if not rows:
            return {
                "rows": [],
                "available_total": 0,
                "returned_total": 0,
                "page": scoped_page,
                "page_size": scoped_page_size,
                "has_next_page": False,
            }

        for row in rows:
            _hydrate_location_fields(row)

        filtered_rows = rows
        if skill_lower:
            candidate_ids = {row["job_id"] for row in rows}
            # Use chunked path (not RPC) so display_name is available.
            # Entity skills panel shows display_name; match against both fields for resilience.
            sk_rows = fetch_job_skill_rows_for_ids(
                self._db,
                list(candidate_ids),
                columns="job_id, skills(taxonomy_key, display_name)",
            )
            matching_ids = {
                row["job_id"]
                for row in sk_rows
                if skill_lower in (
                    ((row.get("skills") or {}).get("taxonomy_key") or "").strip().lower(),
                    ((row.get("skills") or {}).get("display_name") or "").strip().lower(),
                )
            }
            filtered_rows = [row for row in rows if row["job_id"] in matching_ids]

        filtered_rows = [
            row
            for row in filtered_rows
            if _matches_location_filters(
                row,
                location_city=location_city,
                location_country=location_country,
                location_mode=location_mode,
            )
        ]
        filtered_rows = sorted(filtered_rows, key=lambda row: str(row.get("job_id") or ""))
        available_total = len(filtered_rows)
        start = (scoped_page - 1) * scoped_page_size
        end = start + scoped_page_size
        page_rows = filtered_rows[start:end] if start < available_total else []
        returned_total = len(page_rows)

        result = {
            "rows": page_rows,
            "available_total": available_total,
            "returned_total": returned_total,
            "page": scoped_page,
            "page_size": scoped_page_size,
            "has_next_page": (start + returned_total) < available_total,
        }
        _search_cache[cache_key] = (time.monotonic(), result)
        return result

    # ── user skills / demand ───────────────────────────────────────────────────

    def get_user_skills_with_taxonomy(self, user_id: str) -> list[dict[str, Any]]:
        result = (
            self._db.table("user_skills")
            .select("matched_level, proficiency_title, skills(taxonomy_key, display_name)")
            .eq("user_id", user_id)
            .execute()
        )
        return result.data or []

    def get_user_skill_demand_snapshot(self, user_id: str) -> list[dict[str, Any]]:
        """
        Returns per-user Skill demand stats without scanning the full Job Skill read model.

        Shape:
          [
            {
              "skill": "<taxonomy_key>",
              "display_name": "<display_name>",
              "current_level": <int>,
              "proficiency_title": "<title>",
              "job_count_30d": <int>,
              "weighted_demand": <int>,
            },
          ]
        """
        rows = (
            self._db.table("user_skills")
            .select("matched_level, proficiency_title, skills(id, taxonomy_key, display_name)")
            .eq("user_id", user_id)
            .execute()
        ).data or []

        user_skills_by_id: dict[int, dict[str, Any]] = {}
        for row in rows:
            skill = row.get("skills") or {}
            raw_skill_id = skill.get("id")
            if raw_skill_id is None:
                continue
            try:
                skill_id = int(raw_skill_id)
            except (TypeError, ValueError):
                continue
            taxonomy_key = (skill.get("taxonomy_key") or "").strip()
            if not taxonomy_key:
                continue
            display_name = (skill.get("display_name") or taxonomy_key).strip() or taxonomy_key
            user_skills_by_id[skill_id] = {
                "skill": taxonomy_key,
                "display_name": display_name,
                "current_level": int(row.get("matched_level") or 0),
                "proficiency_title": row.get("proficiency_title") or "Scout",
            }

        if not user_skills_by_id:
            return []

        skill_ids = list(user_skills_by_id.keys())
        demand_rows = fetch_all_rows(
            self._db,
            table="job_skills",
            columns="skill_id, is_primary",
            query_builder=lambda q, _skill_ids=skill_ids: q.in_("skill_id", _skill_ids),
        )

        weighted_demand: dict[int, int] = {skill_id: 0 for skill_id in skill_ids}
        job_count: dict[int, int] = {skill_id: 0 for skill_id in skill_ids}
        for row in demand_rows:
            raw_skill_id = row.get("skill_id")
            try:
                skill_id = int(raw_skill_id)
            except (TypeError, ValueError):
                continue
            if skill_id not in user_skills_by_id:
                continue
            weighted_demand[skill_id] = weighted_demand.get(skill_id, 0) + (2 if row.get("is_primary") else 1)
            job_count[skill_id] = job_count.get(skill_id, 0) + 1

        return [
            {
                **skill_meta,
                "job_count_30d": job_count.get(skill_id, 0),
                "weighted_demand": weighted_demand.get(skill_id, 0),
            }
            for skill_id, skill_meta in user_skills_by_id.items()
        ]

    def get_all_jobs_skills(self) -> list[dict[str, Any]]:
        """Returns job skills from the FK-enforced job_skills join table."""
        return group_job_skill_rows(fetch_job_skill_rows(self._db))

    _LOCATION_FILTER_CHUNK = 200

    def _filter_job_ids_by_location(
        self,
        job_ids: list[str],
        target_location_country: str,
    ) -> list[str]:
        """Hard-filter job_ids by target country.

        Include if location_country matches OR (location_country is NULL AND mode is remote/hybrid).
        Queries in chunks of 200 to stay within PostgREST URL limits.
        """
        country_lower = target_location_country.strip().lower()
        result: list[str] = []
        for i in range(0, len(job_ids), self._LOCATION_FILTER_CHUNK):
            chunk = job_ids[i:i + self._LOCATION_FILTER_CHUNK]
            rows = (
                self._db.table("jobs")
                .select("job_id, location_country, location_mode")
                .in_("job_id", chunk)
                .execute()
            ).data or []
            for row in rows:
                country = (row.get("location_country") or "").strip().lower()
                mode = (row.get("location_mode") or "").strip().lower()
                if country and country == country_lower:
                    result.append(row["job_id"])
                elif not country and mode in ("remote", "hybrid"):
                    result.append(row["job_id"])
        return result

    def get_candidate_job_ids_for_skills(
        self,
        skill_keys: list[str],
        *,
        target_location_country: str | None = None,
    ) -> list[str]:
        """Job_ids that have at least one skill in skill_keys, filtered by target location.

        target_location_country: if set, only jobs in that country (or remote/hybrid with
        no country set) are returned. None means no location filter.
        """
        if not skill_keys:
            return []

        # IMPORTANT: taxonomy_key in `skills` is canonical Lightcast case
        # (e.g. "Python (Programming Language)"). `user_skill_map` keys are
        # sourced from the same column, so we must preserve case here.
        normalized_keys: list[str] = []
        seen: set[str] = set()
        for raw in skill_keys:
            key = (raw or "").strip()
            if not key or key in seen:
                continue
            seen.add(key)
            normalized_keys.append(key)
        if not normalized_keys:
            return []

        skill_id_rows = (
            self._db.table("skills")
            .select("id")
            .in_("taxonomy_key", normalized_keys)
            .execute()
        ).data or []
        skill_ids = [r["id"] for r in skill_id_rows]
        if not skill_ids:
            return []
        js_rows = fetch_all_rows(
            self._db,
            table="job_skills",
            columns="job_id",
            query_builder=lambda q: q.in_("skill_id", skill_ids),
        )
        all_job_ids = list({r["job_id"] for r in js_rows})
        if not target_location_country:
            return all_job_ids
        return self._filter_job_ids_by_location(all_job_ids, target_location_country)

    def get_all_job_skill_rows(self, *, job_ids: list[str] | None = None) -> list[dict[str, Any]]:
        """Raw job_skills JOIN skills rows for the matcher. No grouping."""
        return fetch_job_skill_rows(self._db, job_ids=job_ids)

    def get_jobs_by_ids(self, job_ids: list[str]) -> list[dict[str, Any]]:
        """Fetch job metadata for a specific list of job_ids."""
        if not job_ids:
            return []
        rows = (
            self._db.table("jobs")
            .select(
                "job_id, job_title, job_description, company_name, industry, "
                "location, location_raw, location_city, location_country, location_mode, location_quality, apply_url"
            )
            .in_("job_id", job_ids)
            .execute()
        ).data or []
        for row in rows:
            _hydrate_location_fields(row)
        return rows

    def get_user_target_roles(self, user_id: str) -> list[str]:
        result = (
            self._db.table("user_profiles")
            .select("target_roles")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        return ((result.data if result else {}) or {}).get("target_roles") or []

    # ── job matches ────────────────────────────────────────────────────────────

    def get_feed_updated_at(self) -> str | None:
        return get_feed_updated_at(self._db)

    def get_existing_match_job_ids(self, user_id: str, batch_week: date) -> list[str]:
        result = (
            self._db.table("user_job_matches")
            .select("job_id")
            .eq("user_id", user_id)
            .eq("batch_week", str(batch_week))
            .execute()
        )
        return [r["job_id"] for r in (result.data or [])]

    def get_user_matches_for_week(
        self, user_id: str, batch_week: date
    ) -> list[dict[str, Any]]:
        result = (
            self._db.table("user_job_matches")
            .select(
                "id, job_id, overlap_score, llm_rank, llm_explanation, "
                "batch_week, computed_at, matched_skills, "
                "overall_score, grade, recommendation, application_angle, summary, "
                "role_fit, comp_fit, growth_fit, culture_fit, risk_score, strengths, concerns, "
                "jobs(job_title, company_name, industry, location, location_raw, location_city, "
                "location_country, location_mode, location_quality, apply_url, job_description)"
            )
            .eq("user_id", user_id)
            .eq("batch_week", str(batch_week))
            .order("llm_rank")
            .execute()
        )
        rows = result.data or []
        for row in rows:
            if row.get("jobs"):
                _hydrate_location_fields(row["jobs"])
        return rows

    def get_match_explanation(
        self, user_id: str, job_id: str, batch_week: date
    ) -> str | None:
        """Cached LLM fit-rationale for this (user, job, week), if already analysed.

        Drives the idempotency of the streaming analyse endpoint — a non-null
        return means replay the cached text, never re-charge or re-call the LLM.
        """
        result = (
            self._db.table("user_job_matches")
            .select("llm_explanation")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .eq("batch_week", str(batch_week))
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None
        return (rows[0].get("llm_explanation") or "").strip() or None

    def upsert_job_match(self, user_id: str, job_id: str, data: dict[str, Any]) -> None:
        self._admin_db.table("user_job_matches").upsert(
            {"user_id": user_id, "job_id": job_id, **data},
            on_conflict="user_id,job_id,batch_week",
        ).execute()

    # ── Q8 deepeners — XP-gated follow-up answers, cached per (user, job, prompt)
    def get_deepening(self, user_id: str, job_id: str, prompt_key: str) -> str | None:
        result = (
            self._db.table("job_deepenings")
            .select("answer")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .eq("prompt_key", prompt_key)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None
        return (rows[0].get("answer") or "").strip() or None

    def list_deepenings(self, user_id: str, job_id: str) -> list[dict[str, Any]]:
        result = (
            self._db.table("job_deepenings")
            .select("prompt_key, answer")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .execute()
        )
        return result.data or []

    def upsert_deepening(self, user_id: str, job_id: str, prompt_key: str, answer: str) -> None:
        self._admin_db.table("job_deepenings").upsert(
            {"user_id": user_id, "job_id": job_id, "prompt_key": prompt_key, "answer": answer},
            on_conflict="user_id,job_id,prompt_key",
        ).execute()

    def get_deepening_sampled(self, user_id: str) -> bool:
        result = (
            self._db.table("user_profiles")
            .select("deepening_sampled")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return bool(rows and rows[0].get("deepening_sampled"))

    def set_deepening_sampled(self, user_id: str) -> None:
        self._admin_db.table("user_profiles").update(
            {"deepening_sampled": True}
        ).eq("user_id", user_id).execute()

    def get_user_skill_rows(self, user_id: str) -> list[dict[str, Any]]:
        result = (
            self._db.table("user_skills")
            .select("matched_level, skills(taxonomy_key)")
            .eq("user_id", user_id)
            .execute()
        )
        return result.data or []

    def get_user_profile_targeting(self, user_id: str) -> dict[str, Any]:
        result = (
            self._db.table("user_profiles")
            .select(
                "target_roles, target_location, target_location_country, "
                "deal_breakers, career_goal, superpower"
            )
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        profile = (result.data if result else None) or {}
        profile["cv_markdown"] = self.get_user_cv_markdown(user_id)
        return profile

    def get_user_cv_markdown(self, user_id: str) -> str:
        """Latest CV text for the Matching Brain prompt.

        Prefers the baseline upload (the user's general CV), newest version first;
        falls back to any version. Returns polished_text when present, else body_text,
        else "" so the prompt degrades gracefully.
        """
        def _newest(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
            return max(
                rows, key=lambda r: int(r.get("user_version_number") or 0), default=None
            )

        baselines = (
            self._db.table("cv_versions")
            .select("body_text, polished_text, user_version_number")
            .eq("user_id", user_id)
            .eq("kind", "baseline_upload")
            .execute()
        ).data or []
        row = _newest(baselines)
        if row is None:
            any_rows = (
                self._db.table("cv_versions")
                .select("body_text, polished_text, user_version_number")
                .eq("user_id", user_id)
                .execute()
            ).data or []
            row = _newest(any_rows)
        if not row:
            return ""
        return (row.get("polished_text") or row.get("body_text") or "").strip()

    # ── applications ───────────────────────────────────────────────────────────

    def get_user_applications(self, user_id: str) -> list[dict[str, Any]]:
        # NOTE: join on `jobs` requires RLS to allow `authenticated` reads on public.jobs.
        result = (
            self._db.table("job_applications")
            .select("*, jobs(job_title, company_name, job_description)")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []

    def upsert_application(
        self, user_id: str, job_id: str, updates: dict[str, Any]
    ) -> None:
        self._db.table("job_applications").upsert(
            {"user_id": user_id, "job_id": job_id, **updates},
            on_conflict="user_id,job_id",
        ).execute()

    def get_application_with_job(
        self, user_id: str, job_id: str
    ) -> dict[str, Any] | None:
        # NOTE: join on `jobs` requires RLS to allow `authenticated` reads on public.jobs.
        result = (
            self._db.table("job_applications")
            .select("*, jobs(job_title, company_name, job_description)")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .maybe_single()
            .execute()
        )
        return (result.data if result else None) or None

    def delete_tracker_rows(self, user_id: str, job_id: str) -> None:
        for table_name in ("job_applications", "user_job_matches"):
            (
                self._db.table(table_name)
                .delete()
                .eq("user_id", user_id)
                .eq("job_id", job_id)
                .execute()
            )

    def get_stale_applications(self, user_id: str) -> list[dict[str, Any]]:
        # Q7: filter on dedicated last_stage_changed_at column so notes/followed_up
        # edits don't mask company silence. Dismiss also bumps this column → 7-day snooze.
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        stages = ["saved", "applied", "screening", "interviewing", "final_round"]
        result = (
            self._db.table("job_applications")
            .select("id, job_id, status, last_stage_changed_at, updated_at, jobs(job_title, company_name)")
            .eq("user_id", user_id)
            .in_("status", stages)
            .lt("last_stage_changed_at", cutoff)
            .order("last_stage_changed_at", desc=False)
            .execute()
        )
        return result.data or []

    def dismiss_stale_application(self, user_id: str, job_id: str) -> bool:
        # Q7: dismiss = bump last_stage_changed_at = now() → effectively snoozes 7 days.
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        result = (
            self._db.table("job_applications")
            .update({"last_stage_changed_at": now})
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .execute()
        )
        return bool(result.data)

    def mark_first_offer_if_unset(self, user_id: str, timestamp_iso: str) -> bool:
        # Q6: set first_offer_at exactly once per user. Returns True only when this
        # call was the one that wrote it (drives the one-time sparkle on the tracker card).
        existing = (
            self._db.table("user_profiles")
            .select("first_offer_at")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        existing_data = existing.data if existing else None
        if existing_data and existing_data.get("first_offer_at"):
            return False
        self._db.table("user_profiles").update(
            {"first_offer_at": timestamp_iso}
        ).eq("user_id", user_id).execute()
        return True

    def insert_application_review(
        self,
        *,
        job_application_id: int,
        user_id: str,
        company_name: str,
        star_rating: int,
        last_stage: str,
        outcome: str,
        written_note: str | None,
    ) -> dict[str, Any]:
        try:
            result = (
                self._db.table("application_reviews")
                .insert({
                    "job_application_id": job_application_id,
                    "user_id": user_id,
                    "company_name": company_name,
                    "star_rating": star_rating,
                    "last_stage": last_stage,
                    "outcome": outcome,
                    "written_note": written_note,
                })
                .execute()
            )
        except Exception as exc:
            if "unique" in str(exc).lower():
                from fastapi import HTTPException
                raise HTTPException(status_code=409, detail="Review already submitted for this application")
            raise
        return (result.data or [{}])[0]

    # ── skill gap ──────────────────────────────────────────────────────────────

    def get_job_skills(self, job_id: str) -> dict[str, Any] | None:
        meta = (
            self._db.table("jobs")
            .select("job_id, job_title, company_name")
            .eq("job_id", job_id)
            .maybe_single()
            .execute()
        )
        if not meta or not meta.data:
            return None

        rows = (
            self._admin_db.table("job_skills")
            .select("is_primary, required_level, skills(taxonomy_key)")
            .eq("job_id", job_id)
            .execute()
        ).data or []

        skills: list[dict[str, Any]] = []
        for row in rows:
            key = ((row.get("skills") or {}).get("taxonomy_key") or "").strip()
            if not key:
                continue
            is_primary = bool(row.get("is_primary"))
            required_level = row.get("required_level") or (4 if is_primary else 2)
            skills.append({"taxonomy_key": key, "is_primary": is_primary, "required_level": required_level})

        return {**meta.data, "skills": skills}

    def get_user_skill_map(self, user_id: str) -> dict[str, int]:
        result = (
            self._db.table("user_skills")
            .select("matched_level, skills(taxonomy_key)")
            .eq("user_id", user_id)
            .execute()
        )
        return {
            row["skills"]["taxonomy_key"].lower(): row["matched_level"]
            for row in (result.data or [])
            if row.get("skills") and row["skills"].get("taxonomy_key")
        }


    def resolve_role_domain_for_clusters(self, clusters: list[str]) -> str | None:
        """Map L2 taxonomy cluster names → best matching jobs.role_domain.

        Uses the taxonomy chain: clusters → skills.l2_cluster → job_skills → jobs.role_domain.
        Samples up to 100 jobs to find the dominant domain (avoids URL-length explosion).
        """
        if not clusters:
            return None

        # skills table has l2_cluster (denormalized from taxonomy) — small result, fine URL
        skills_result = (
            self._db.table("skills")
            .select("id")
            .in_("l2_cluster", clusters)
            .execute()
        )
        skill_ids = [row["id"] for row in (skills_result.data or [])]
        if not skill_ids:
            return None

        # skill_ids are integers — short URL even for 200 skills
        js_result = (
            self._db.table("job_skills")
            .select("job_id")
            .in_("skill_id", skill_ids)
            .limit(200)
            .execute()
        )
        job_ids_sample = list({row["job_id"] for row in (js_result.data or [])})[:100]
        if not job_ids_sample:
            return None

        # 100 UUIDs × 37 chars = ~3,700 chars — within PostgREST URL limits
        jobs_result = (
            self._db.table("jobs")
            .select("role_domain")
            .in_("job_id", job_ids_sample)
            .not_.is_("role_domain", "null")
            .execute()
        )
        role_counts: Counter[str] = Counter()
        for row in (jobs_result.data or []):
            domain = (row.get("role_domain") or "").strip()
            if domain:
                role_counts[domain] += 1

        return role_counts.most_common(1)[0][0] if role_counts else None


    def fetch_company_jobs_page(
        self,
        company_name: str,
        *,
        page: int = 1,
        page_size: int = 50,
    ) -> dict[str, Any]:
        """All jobs for a company, paginated, with primary skills per job."""
        rows = fetch_all_rows(
            self._db,
            table="jobs",
            columns=(
                "job_id, job_title, location, location_raw, "
                "location_city, location_country, location_mode, location_quality"
            ),
            query_builder=lambda q: q.ilike("company_name", company_name),
        )
        for row in rows:
            _hydrate_location_fields(row)
        rows = sorted(rows, key=lambda r: str(r.get("job_id") or ""))
        total = len(rows)
        start = max(0, (page - 1)) * page_size
        page_rows = rows[start : start + page_size]

        job_ids = [r["job_id"] for r in page_rows if r.get("job_id")]
        skill_map: dict[str, list[str]] = {jid: [] for jid in job_ids}
        if job_ids:
            sk_rows = fetch_job_skill_rows_for_ids(
                self._db,
                job_ids,
                columns="job_id, is_primary, skills(display_name)",
            )
            for sr in sk_rows:
                jid = sr.get("job_id")
                if sr.get("is_primary") and jid and jid in skill_map:
                    dn = ((sr.get("skills") or {}).get("display_name") or "").strip()
                    if dn and len(skill_map[jid]) < 5:
                        skill_map[jid].append(dn)

        return {
            "company_name": company_name,
            "total": total,
            "jobs": [
                {
                    "job_id": r["job_id"],
                    "title": r.get("job_title") or "Untitled role",
                    "location": r.get("location"),
                    "location_city": r.get("location_city"),
                    "location_country": r.get("location_country"),
                    "location_mode": r.get("location_mode"),
                    "primary_skills": skill_map.get(r["job_id"], []),
                }
                for r in page_rows
                if r.get("job_id")
            ],
            "page": page,
            "page_size": page_size,
            "has_next": (start + page_size) < total,
        }


def get_public_jobs_repository() -> JobsRepository:
    # Public endpoints have no JWT — admin client reads global reference data.
    return JobsRepository(get_supabase_admin())


def get_token_jobs_repository(db: Client = Depends(get_user_db)) -> JobsRepository:
    return JobsRepository(db, admin_db=get_supabase_admin())


def get_admin_jobs_repository() -> JobsRepository:
    """Admin factory — internal/ops scripts only. Not for user-facing routes."""
    return JobsRepository(get_supabase_admin())
