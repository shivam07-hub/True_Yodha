from __future__ import annotations

import logging
import re
import time
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import Depends
from postgrest.exceptions import APIError
from supabase import Client

from app.database import get_supabase_admin
from app.db_safe import safe_read
from app.deps import get_user_db
from app.repositories.job_skills_read_model import fetch_all_rows, fetch_job_skill_rows, fetch_job_skill_rows_for_ids, group_job_skill_rows
from app.services import job_importer, shared_cache, skill_floor
from app.services.background import debounce
from app.services.company_pulse import SERIES_DAYS, build_series, compute_pulse
from app.services.industry_grouping import normalize_industry_group
from app.services.job_history import attach_jobs
from app.services.job_intelligence_policy import is_recommendable_listing
from app.services.job_eligibility import (
    career_band_for_job,
    career_band_for_profile,
    job_is_browse_eligible,
    job_is_eligible,
    seniority_for_job,
    target_seniority_for_profile,
)
from app.services.location_normalizer import normalize_location

_log = logging.getLogger("app.repositories.jobs")

# The demand RPC fallback is the slow path #21(1b) retires — log the FIRST miss
# loudly (the migration isn't applied yet) without spamming every request.
_demand_rpc_fallback_warned = False


def _warn_demand_rpc_fallback(exc: APIError) -> None:
    global _demand_rpc_fallback_warned
    if _demand_rpc_fallback_warned:
        return
    _demand_rpc_fallback_warned = True
    _log.warning(
        "metric demand.rpc_fallback count_job_demand_for_skills unavailable (%s) — "
        "serving demand via the slow row-scan path; apply migration "
        "20260613_job_demand_counts_rpc + NOTIFY pgrst",
        exc,
    )


SKILL_DRILL_DEFAULT_PAGE_SIZE = 50
# A posting the scraper hasn't re-confirmed live in this many days is flagged
# stale on job cards. Below the scraper's 45-day hard-delist so it warns first.
STALE_AFTER_DAYS = 21
# .in_() serialises each id into the URL query string — cap batch size so a huge
# scrape's job_id list can't blow the PostgREST URL length limit (Backlog #36).
_SWEEP_IN_CHUNK_SIZE = 200
_ANALYTICS_TTL = 7 * 24 * 3600  # 7 days — market analytics change slowly
_SEARCH_TTL = 24 * 3600          # 1 day — job listings stale tolerance
_COMPANY_SEARCH_TTL = 24 * 3600  # 1 day — scraped companies change with the job feed
_analytics_cache = shared_cache.SharedTTLMapping("jobs.analytics", ttl_seconds=_ANALYTICS_TTL)
_entity_skills_cache = shared_cache.SharedTTLMapping("jobs.entity_skills", ttl_seconds=_ANALYTICS_TTL)
_heatmap_cache = shared_cache.SharedTTLMapping("jobs.heatmap", ttl_seconds=_ANALYTICS_TTL)
_heatmap_row_cache = shared_cache.SharedTTLMapping("jobs.heatmap_row", ttl_seconds=_ANALYTICS_TTL)
_gap_signal_cache = shared_cache.SharedTTLMapping("jobs.gap_signal", ttl_seconds=30 * 60)
# fetch_company_pulse and fetch_indexable_companies moved to shared_cache
# (ARCHITECTURE_READ_PATH.md S3) — cross-replica, not per-process — so these
# TTLs are now the args to shared_cache.get_or_compute rather than keys into a
# local dict.
_PULSE_TTL = 30 * 60  # 30 min — pulse tracks daily scrape batches, not real-time
_INDEXABLE_TTL = 60 * 60  # 1 hour — matches the /companies page ISR window
_skill_name_to_id_cache = shared_cache.SharedTTLMapping(
    "jobs.skill_name_to_id", ttl_seconds=7 * 24 * 3600
)
_search_cache = shared_cache.SharedTTLMapping("jobs.search", ttl_seconds=_SEARCH_TTL)
_company_search_cache = shared_cache.SharedTTLMapping(
    "jobs.company_search", ttl_seconds=_COMPANY_SEARCH_TTL
)

_FEED_TS_TTL = 5 * 60  # 5 minutes — cheap guard against repeated MAX() queries
_FEED_TS_STALE = 60 * 60  # serve the last known marker for an hour rather than nothing

# /market browse feed — latency is the feature, so cache the DB round-trip on a
# short TTL. Cached values are RAW DB rows; shaping (matched_skill_count) runs
# per-request against the caller's CV skills so two users sharing a filter never
# leak each other's overlap. Keys carry every dimension that changes the query:
# sort + role_domain + location + free-text + page bounds (DB paths) — the
# personal path paginates in Python, so its candidate set is page-independent.
_FEED_TTL = 5 * 60  # 5 minutes — bound browse staleness against continuous scrapes
_feed_page_cache = shared_cache.SharedTTLMapping("jobs.feed_page", ttl_seconds=_FEED_TTL)
_feed_personal_cache = shared_cache.SharedTTLMapping("jobs.feed_personal.v2", ttl_seconds=_FEED_TTL)
# Per-user CV skill keys — recomputed on every feed call before this cache.
_USER_SKILL_KEYS_TTL = 5 * 60  # 5 minutes — CV skills change only on edit/re-upload
_user_skill_keys_cache = shared_cache.SharedTTLMapping(
    "jobs.user_skill_keys", ttl_seconds=_USER_SKILL_KEYS_TTL
)
_USER_TARGET_LOCATIONS_TTL = 5 * 60  # 5 minutes — prefs change only via Settings
_user_target_locations_cache = shared_cache.SharedTTLMapping(
    "jobs.user_target_locations", ttl_seconds=_USER_TARGET_LOCATIONS_TTL
)

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


_ROLE_TOKEN_RE = re.compile(r"[a-z0-9+#]+")
# Seniority/structure words are stripped so a target role matches regardless of
# the level prefix on the posting ("Data Analyst" target ↔ "Senior Data Analyst").
_ROLE_STOPWORDS = frozenset(
    {"and", "of", "the", "in", "for", "to", "with", "a", "an", "at", "on",
     "senior", "junior", "lead", "principal", "staff", "sr", "jr",
     "i", "ii", "iii", "iv"}
)
_JOB_QUERY_GENERIC_WORDS = frozenset(
    {
        "job",
        "jobs",
        "opening",
        "openings",
        "opportunity",
        "opportunities",
        "position",
        "positions",
        "role",
        "roles",
    }
)


def clear_user_target_locations_cache(user_id: str) -> None:
    """Invalidate the per-user geo preference cache after a profile write."""
    _user_target_locations_cache.pop(user_id, None)


_GLOBAL_SEARCH_STOPWORDS = frozenset(
    {
        "want", "role", "roles", "job", "jobs", "looking", "look", "search",
        "find", "need", "openings", "opening", "in", "at", "for", "and", "or",
        "the", "a", "an", "to", "of", "with", "my", "me", "i", "post",
    }
)
_GLOBAL_SEARCH_ALIASES = {
    "gurugram": ["gurugram", "gurgaon"],
    "gurgaon": ["gurugram", "gurgaon"],
    "gurgoan": ["gurugram", "gurgaon"],
    "bengaluru": ["bengaluru", "bangalore"],
    "bangalore": ["bengaluru", "bangalore"],
}
_POST_MBA_TERMS = [
    "consultant",
    "strategy",
    "manager",
    "product",
    "growth",
    "operations",
    "program",
    "business",
    "development",
]


def _dedupe_lower(values: list[str], *, limit: int) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        text = value.strip().casefold()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
        if len(out) >= limit:
            break
    return out


def _global_search_terms(query: str) -> list[str]:
    lowered = query.casefold()
    expanded: list[str] = []
    if (
        "post mba" in lowered
        or "post-mba" in lowered
        or "after mba" in lowered
        or "mba roles" in lowered
    ):
        expanded.extend(_POST_MBA_TERMS)
    tokens = [
        token for token in _ROLE_TOKEN_RE.findall(lowered.replace("&", " ai "))
        if len(token) > 1 and token not in _GLOBAL_SEARCH_STOPWORDS
    ]
    for token in tokens:
        if token == "mba":
            continue
        expanded.extend(_GLOBAL_SEARCH_ALIASES.get(token, [token]))
    if re.search(r"\bdata\b.*\bai\b|\bai\b.*\bdata\b|data\s*&\s*ai", lowered):
        expanded.extend(["data", "ai"])
    if re.search(r"\bsolution\b.*\bconsult", lowered):
        expanded.extend(["solution", "consultant"])
    if re.search(r"\bgtm\b|go[- ]to[- ]market", lowered):
        expanded.append("gtm")
    if "strategy" in lowered:
        expanded.append("strategy")
    return _dedupe_lower(expanded, limit=14)


def _global_search_location_terms(query: str) -> list[str]:
    lowered = query.casefold()
    expanded: list[str] = []
    for token in _ROLE_TOKEN_RE.findall(lowered):
        if token in _GLOBAL_SEARCH_ALIASES:
            expanded.extend(_GLOBAL_SEARCH_ALIASES[token])
    return _dedupe_lower(expanded, limit=6)


def _global_search_rank(row: dict[str, Any], terms: list[str]) -> int:
    title = str(row.get("job_title") or "").casefold()
    company = str(row.get("company_name") or "").casefold()
    role_domain = str(row.get("role_domain") or "").casefold()
    city = str(row.get("location_city") or "").casefold()
    country = str(row.get("location_country") or "").casefold()
    haystack = " ".join([title, company, role_domain, city, country])
    score = 0
    for term in terms:
        if term in title:
            score += 5
        if term in role_domain:
            score += 4
        if term in city or term in country:
            score += 3
        if term in company:
            score += 2
        if term in haystack:
            score += 1
    return score


def _global_search_location_match(row: dict[str, Any], location_terms: list[str]) -> bool:
    if not location_terms:
        return True
    city = str(row.get("location_city") or "").casefold()
    country = str(row.get("location_country") or "").casefold()
    return any(term in city or term in country for term in location_terms)


def _role_token_sets(target_roles: list[str] | None) -> list[set[str]]:
    """Significant-token set per target role, for honest token-subset matching."""
    sets: list[set[str]] = []
    for role in target_roles or []:
        toks = {
            t for t in _ROLE_TOKEN_RE.findall((role or "").lower())
            if t not in _ROLE_STOPWORDS and len(t) > 1
        }
        if toks:
            sets.append(toks)
    return sets


def _feed_search_patterns(term: str) -> tuple[str, ...]:
    safe = (
        term.replace(",", " ")
        .replace("(", " ")
        .replace(")", " ")
        .replace("%", " ")
        .replace("_", " ")
    )
    exact = " ".join(safe.split())
    if len(exact) < 2:
        return ()

    patterns = [exact]
    tokens = _ROLE_TOKEN_RE.findall(exact.lower())
    core = " ".join(token for token in tokens if token not in _JOB_QUERY_GENERIC_WORDS)
    if len(core) >= 2 and core != exact.lower():
        patterns.append(core)
    return tuple(dict.fromkeys(patterns))


def _role_match_score(
    job_title: str | None, role_domain: str | None, token_sets: list[set[str]]
) -> int:
    """How many of the user's target roles this job's title/domain covers.

    A target role 'counts' when all its significant tokens appear in the job's
    title or role_domain. Token-subset match — no LLM, no fuzzy guessing, no
    fabricated relevance. Returns 0 when the user has set no target roles.
    """
    if not token_sets:
        return 0
    hay_tokens = set(_ROLE_TOKEN_RE.findall(f"{job_title or ''} {role_domain or ''}".lower()))
    if not hay_tokens:
        return 0
    return sum(1 for toks in token_sets if toks <= hay_tokens)


# Fit-rank weights — the "Best fit" composite (market filter rework, Q7,
# locked 2026-06-05). (skill, role, fresh). Renormalized to whatever signals
# the user actually has so an absent CV / absent target roles never zeros a
# whole deck. Source of truth ↔ frontend feed-types.ts FIT_WEIGHTS.
_FIT_WEIGHTS: dict[str, tuple[float, float, float]] = {
    "both": (0.5, 0.3, 0.2),   # CV + target roles
    "cv": (0.7, 0.0, 0.3),     # CV only
    "roles": (0.0, 0.6, 0.4),  # target roles only
    "none": (0.0, 0.0, 1.0),   # neither → pure freshness
}


def _fit_scores(
    rows: list[dict[str, Any]],
    *,
    has_cv: bool,
    has_roles: bool,
    num_target_roles: int,
) -> dict[str, float]:
    """Composite 'Best fit' score per job_id, normalized over the candidate set.

    Weighted sum of three signals already shaped onto every row — skill-overlap,
    target-role match, recency — each min-max normalized within `rows` so the
    weights stay comparable regardless of absolute counts. Weights renormalize
    to the signals the user has (no CV → skill weight redistributes), so the
    score never collapses to zero for a whole deck. Pure ordering: no new
    fetch, no new column. job_ids absent from the result sort as 0.
    """
    if has_cv and has_roles:
        w_skill, w_role, w_fresh = _FIT_WEIGHTS["both"]
    elif has_cv:
        w_skill, w_role, w_fresh = _FIT_WEIGHTS["cv"]
    elif has_roles:
        w_skill, w_role, w_fresh = _FIT_WEIGHTS["roles"]
    else:
        w_skill, w_role, w_fresh = _FIT_WEIGHTS["none"]

    max_skill = max((r["matched_skill_count"] for r in rows), default=0)
    role_denom = num_target_roles if num_target_roles > 0 else 1
    fresh_ts: dict[str, float] = {}
    for r in rows:
        dt = _parse_iso_dt(r["first_seen"])
        if dt is not None:
            fresh_ts[r["job_id"]] = dt.timestamp()
    fresh_min = min(fresh_ts.values(), default=0.0)
    fresh_max = max(fresh_ts.values(), default=0.0)
    fresh_span = (fresh_max - fresh_min) or 1.0

    scores: dict[str, float] = {}
    for r in rows:
        skill_norm = (r["matched_skill_count"] / max_skill) if max_skill > 0 else 0.0
        role_norm = min(1.0, r["target_role_match"] / role_denom)
        ts = fresh_ts.get(r["job_id"])
        fresh_norm = ((ts - fresh_min) / fresh_span) if ts is not None else 0.0
        scores[r["job_id"]] = w_skill * skill_norm + w_role * role_norm + w_fresh * fresh_norm
    return scores


def _empty_feed(mode: str, page: int, page_size: int) -> dict[str, Any]:
    return {
        "rows": [], "available_total": 0, "returned_total": 0,
        "page": page, "page_size": page_size, "has_next_page": False, "sort": mode,
    }


def _marker_to_dt(value: Any) -> datetime | None:
    """Parse a jobs feed marker (YYYYMMDD int/str) or ISO string → aware datetime.

    The `jobs` table stores first_seen / last_seen / batch_date as integer
    YYYYMMDD markers, not timestamps. Route those through the marker→ISO
    converter before ISO parsing so analytics date math works on real values.
    """
    return _parse_iso_dt(_job_feed_marker_to_iso(value))


def _is_marker_stale(value: Any) -> bool:
    """True when a last_seen marker is older than STALE_AFTER_DAYS."""
    dt = _marker_to_dt(value)
    if dt is None:
        return False
    return (datetime.now(dt.tzinfo) - dt).days > STALE_AFTER_DAYS


def _marker_int(value: Any) -> int | None:
    """A jobs first_seen/last_seen marker as a comparable YYYYMMDD int, or None.

    The column stores integer YYYYMMDD markers; tolerate str/float and reject
    anything non-numeric so a malformed marker never crashes pulse math.
    """
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _fresh_cutoff_marker(days: int = STALE_AFTER_DAYS) -> int:
    """YYYYMMDD int for `today - days` — the freshness floor for matching.

    A job whose last_seen is below this hasn't re-appeared in a crawl within the
    window and is treated as stale/likely-delisted (same threshold the UI uses to
    badge a listing stale — see `_is_marker_stale`). Kept as one constant so the
    matcher and the badge can never disagree.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    return int(cutoff.strftime("%Y%m%d"))


def get_feed_updated_at(db: Client) -> str | None:
    """ISO date of the newest job feed marker. Corpus-wide, cached 5 min.

    There is exactly ONE answer to this for the whole platform — it describes
    the corpus, not the caller — so it is Tier 0 by the read contract
    (ARCHITECTURE_READ_PATH.md §2) and belongs in the shared cache, not in a
    per-process dict that every replica fills separately. Kept here rather than
    in a snapshot table because the value already IS a single indexed read; what
    it needed was one cached answer across replicas, which S3's primitive gives.

    Never raises: a missing feed stamp costs a "last updated" line, never the
    response. `stale_seconds` means a DB blip during a refresh serves the last
    known marker for an hour instead of dropping it — strictly better than the
    per-process version, which lost the value entirely on a cold replica.
    """
    def _compute() -> str | None:
        result = db.table("jobs").select("last_seen").order("last_seen", desc=True).limit(1).execute()
        return _job_feed_marker_to_iso(
            ((result.data or [{}])[0].get("last_seen")) if result.data else None
        )

    try:
        return shared_cache.get_or_compute(
            "jobs.feed_updated_at",
            _compute,
            ttl_seconds=_FEED_TS_TTL,
            stale_seconds=_FEED_TS_STALE,
        )
    except Exception as exc:  # noqa: BLE001 — see docstring
        _log.warning("metric feed_updated_at.read_failed exc=%s", exc.__class__.__name__)
        return None


def count_jobs_ingested_after(db: Client, since: datetime) -> int:
    """Count live jobs that LANDED in our DB after ``since``.

    `ingested_at` (DB-owned, DEFAULT now()) is the only honest "new to us" signal.
    The old `first_seen` YYYYMMDD marker is stamped by the scraper from its run-date
    folder, so a batch imported the day after its run carries a marker already in the
    past — invisible to a `first_seen > <last-match date>` compare forever, not just
    late. Timestamps also keep intra-day order, which a date int cannot.
    """
    result = (
        db.table("jobs")
        .select("job_id", count="exact")
        .eq("is_active", True)
        .gt("ingested_at", since.isoformat())
        .limit(1)
        .execute()
    )
    return int(result.count or 0)
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


def _location_match_values(value: str | None, *, kind: Literal["city", "country"]) -> set[str]:
    cleaned = _norm_filter(value)
    if not cleaned:
        return set()
    parsed = normalize_location(cleaned)
    canonical = parsed.location_city if kind == "city" else parsed.location_country
    values = {cleaned.lower()}
    if canonical:
        values.add(canonical.lower())
    return values


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


def _match_week(value: Any) -> date:
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return date.min


def _match_stack_sort_key(row: dict[str, Any]) -> tuple[date, datetime, int]:
    try:
        rank_value = int(row.get("llm_rank") or 9999)
    except (TypeError, ValueError):
        rank_value = 9999
    return (
        _match_week(row.get("batch_week")),
        _parse_iso_dt(row.get("computed_at")) or datetime.min.replace(tzinfo=timezone.utc),
        -rank_value,
    )


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

    if city_filter:
        city_filters = _location_match_values(city_filter, kind="city")
        row_cities = _location_match_values(city, kind="city")
        for raw_city in row.get("locations") or []:
            row_cities.update(_location_match_values(raw_city, kind="city"))
        # Multi-location rows (firecrawl #6) carry their cities in locations[]
        # even when the scalar location_city is NULL — match either.
        if city_filters.isdisjoint(row_cities):
            return False
    if country_filter:
        country_filters = _location_match_values(country_filter, kind="country")
        row_countries = _location_match_values(country, kind="country")
        if country_filters.isdisjoint(row_countries):
            return False
    if mode_filter and (mode or "").lower() != mode_filter.lower():
        return False
    return True


def _safe_location_token(value: str) -> str | None:
    """A location value usable inside a PostgREST or() clause.

    or() splits on commas/parens, so any value carrying them is dropped rather
    than risk a malformed query (mirrors the feed search-term sanitize).
    """
    token = (value or "").strip()
    if not token or "," in token or "(" in token or ")" in token:
        return None
    return token


def build_location_scope(prefs: list[str] | None) -> tuple[str | None, tuple[str, ...]]:
    """OR-across-chips location scope for the personal /market feed.

    Each freeform pref label is parsed by normalize_location into a chip. A job
    matches if it matches ANY chip:
      - city chip (city resolved): location_city == city OR city ∈ locations[]
      - country-only chip ("India (All)"): location_country == country
    Plus: whenever a scope is active, null-country remote/hybrid jobs are
    included (mirrors the match-pipeline include rule).

    Returns (postgrest_or_clause, signature). The clause is None when prefs are
    empty or yield no usable chip → no scope (show all). The signature is a
    stable tuple folded into the feed cache keys.
    """
    if not prefs:
        return None, ()
    terms: list[str] = []
    sig: list[str] = []
    seen_city: set[str] = set()
    seen_country: set[str] = set()
    for label in prefs:
        chip = normalize_location(label)
        city = _safe_location_token(chip.location_city or "")
        country = _safe_location_token(chip.location_country or "")
        if city:
            # City chip → precise match (scalar or locations[]). A repeat is a
            # no-op; it must NOT fall through to a broad country-wide term.
            if city.lower() not in seen_city:
                seen_city.add(city.lower())
                terms.append(f"location_city.eq.{city}")
                terms.append(f"locations.cs.{{{city}}}")
                sig.append(f"city:{city.lower()}")
        elif country and country.lower() not in seen_country:
            seen_country.add(country.lower())
            terms.append(f"location_country.eq.{country}")
            sig.append(f"country:{country.lower()}")
    if not terms:
        return None, ()
    terms.append("and(location_country.is.null,location_mode.in.(remote,hybrid))")
    return ",".join(terms), tuple(sig)


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
        industry_role_counters: dict[str, Counter[str]] = {}
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
        earliest_first_seen: datetime | None = None

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
                if earliest_first_seen is None or created_at_dt < earliest_first_seen:
                    earliest_first_seen = created_at_dt
            if industry:
                industry_counts[industry] += 1
                industry_skill_counters.setdefault(industry, Counter()).update(skills)
                if role:
                    industry_role_counters.setdefault(industry, Counter())[role] += 1
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
        industry_roles = {
            industry: _sorted_counter_items(counter)[:10]
            for industry, counter in industry_role_counters.items()
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
            "scraper_started": earliest_first_seen.isoformat() if earliest_first_seen else None,
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
            # Tier-0 role-family view for /intel. Each count comes from the same
            # current job rows as by_industry, so the UI never guesses which
            # kinds of roles an industry is hiring for.
            "industry_roles": industry_roles,
        }



class JobsRepository:
    def __init__(self, db: Client, admin_db: Client | None = None) -> None:
        self._db = db
        self._admin_db = admin_db or db  # reference-data reads bypass user-token RLS
        self._analytics_compiler = MarketAnalyticsCompiler()

    @property
    def client(self) -> Client:
        return self._db

    # ── imported-job write (mixed ownership) ────────────────────────────────────

    def _existing_first_seen(self, job_id: str) -> int | None:
        rows = (
            self._admin_db.table("jobs")
            .select("first_seen")
            .eq("job_id", job_id)
            .limit(1)
            .execute()
        ).data or []
        return (rows[0] or {}).get("first_seen") if rows else None

    def save_imported_job(self, user_id: str, body: Any) -> dict[str, Any]:
        """Persist an extension-imported job, routing each table to its RLS context.

        ``jobs``, ``job_skills`` and ``job_skill_candidates`` are
        community/scraper-owned — written with the service-role client
        (``_admin_db``), which bypasses RLS. The ``job_applications`` row is
        user-owned, so it (and the read-back) go through the user-token client
        (``_db``) where the "own applications" policy applies.
        """
        plan = job_importer.build_imported_job(user_id, body)

        job_row = plan["job_row"]
        prior_first_seen = self._existing_first_seen(plan["job_id"])
        if prior_first_seen is not None:
            # Re-importing a listing is a new SIGHTING, not a new discovery —
            # `last_seen` moves, `first_seen` must not, or the upsert would keep
            # resetting the corpus's own "when did this appear" answer.
            job_row = {**job_row, "first_seen": prior_first_seen}

        self._admin_db.table("jobs").upsert(
            job_row, on_conflict="job_id"
        ).execute()

        # Ordered after the `jobs` upsert on purpose: job_skills.job_id is a FK,
        # and the role_family trigger fires off this write. Routed through
        # `skill_floor` because it is the one writer of job_skills — the import
        # path is simply its first caller.
        skill_floor.write_skill_floor(
            self._admin_db,
            plan["job_id"],
            plan["skill_rows"],
            evidence_source=plan["skill_source"],
        )

        if plan["candidate_rows"]:
            self._admin_db.table("job_skill_candidates").upsert(
                plan["candidate_rows"], on_conflict="job_id,normalized_label,skill_type"
            ).execute()

        self._db.table("job_applications").upsert(
            plan["application_row"], on_conflict="user_id,job_id"
        ).execute()

        result = (
            self._db.table("job_applications")
            .select("*")
            .eq("user_id", user_id)
            .eq("job_id", plan["job_id"])
            .single()
            .execute()
        )
        row = result.data or {}
        if row:
            attach_jobs([row], self._db, "job_title, company_name, job_description")
        return job_importer.shape_application_response(
            row, plan["job_id"], body, plan["status"]
        )

    def update_imported_job_details(
        self, user_id: str, job_id: str, *, title: str | None, company: str | None
    ) -> dict[str, Any] | None:
        """Correct a user's OWN imported job's role/company (parse fixes).

        Ownership is proven with the user-token client (the "own applications"
        RLS policy); the ``jobs`` write goes through the admin client because
        ``jobs`` is community/scraper-owned — same split as ``save_imported_job``.
        Returns the updated {job_title, company_name}, or ``None`` when the caller
        has no application for this job (not theirs to edit).
        """
        owned = (
            self._db.table("job_applications")
            .select("job_id")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .limit(1)
            .execute()
        )
        if not (owned.data or []):
            return None

        updates: dict[str, Any] = {}
        if title is not None:
            updates["job_title"] = title
        if company is not None:
            updates["company_name"] = company
        if updates:
            self._admin_db.table("jobs").update(updates).eq("job_id", job_id).execute()

        current = (
            self._admin_db.table("jobs")
            .select("job_title, company_name")
            .eq("job_id", job_id)
            .limit(1)
            .execute()
        )
        row = (current.data or [{}])[0]
        return {"job_title": row.get("job_title") or "", "company_name": row.get("company_name")}

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
                "location, location_raw, location_city, location_country, location_mode, location_quality, locations, "
                "main_skills, first_seen, last_seen"
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

    def _jobs_source_marker(self) -> dict[str, Any]:
        """Cheap change-detection signal for the jobs table: row count + newest
        last_seen batch marker. Two index-backed queries (no full scan, no
        compile) — the dirty-guard the daily cron runs before deciding whether
        to recompile. ``last_seen`` is an integer YYYYMMDD batch marker; the
        not-null filter is required because ``ORDER BY ... DESC`` is NULLS FIRST
        in Postgres, which would otherwise surface a null row over the real max.
        """
        count_result = (
            self._admin_db.table("jobs").select("job_id", count="exact").limit(1).execute()
        )
        last_seen_result = (
            self._admin_db.table("jobs")
            .select("last_seen")
            .not_.is_("last_seen", "null")
            .order("last_seen", desc=True)
            .limit(1)
            .execute()
        )
        rows = last_seen_result.data or []
        last_seen = rows[0].get("last_seen") if rows else None
        return {"job_count": int(count_result.count or 0), "last_seen": last_seen}

    def _read_snapshot_marker(self) -> dict[str, Any] | None:
        try:
            result = (
                self._admin_db.table("market_analytics_snapshot")
                .select("source_job_count, source_last_seen, payload")
                .eq("id", 1)
                .limit(1)
                .execute()
            )
        except APIError:
            return None
        rows = result.data or []
        if not rows:
            return None
        payload = rows[0].get("payload")
        return {
            "job_count": rows[0].get("source_job_count"),
            "last_seen": rows[0].get("source_last_seen"),
            "has_industry_roles": isinstance(payload, dict)
            and isinstance(payload.get("industry_roles"), dict),
        }

    def refresh_analytics_snapshot_if_stale(self, *, refreshed_by: str = "cron") -> dict[str, Any]:
        """Recompile the snapshot ONLY when the jobs table changed since the last
        refresh. The daily cron calls this; the expensive compile (full jobs scan)
        runs at most once per scraper batch (scrapes land continuously, by
        company/industry/location), idle spans cost two cheap marker queries.
        Returns refreshed=False with the existing totals on a skip.
        """
        current = self._jobs_source_marker()
        stored = self._read_snapshot_marker()
        if (
            stored is not None
            and stored.get("job_count") == current["job_count"]
            and stored.get("last_seen") == current["last_seen"]
            and stored.get("has_industry_roles") is True
        ):
            existing = self._read_snapshot_payload() or {}
            return {
                "refreshed": False,
                "total_jobs": int(existing.get("total_jobs") or 0),
                "total_companies": int(existing.get("total_companies") or 0),
            }
        result = self.persist_analytics_snapshot(refreshed_by=refreshed_by, marker=current)
        return {"refreshed": True, **result}

    def persist_analytics_snapshot(
        self, *, refreshed_by: str = "system", marker: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Recompile the unfiltered analytics payload and write it to the snapshot table.

        Called by the admin refresh endpoint after a scraper batch finalises, and by
        the dirty-guarded daily refresh. Bypasses the in-process cache so the snapshot
        always reflects current DB state. ``marker`` (count + last_seen) is persisted
        alongside so the next dirty-guard can detect a no-op.
        """
        rows = self.fetch_analytics_rows()
        payload = self._analytics_compiler.compile(rows)
        if marker is None:
            marker = self._jobs_source_marker()
        self._admin_db.table("market_analytics_snapshot").upsert(
            {
                "id": 1,
                "payload": payload,
                "refreshed_at": datetime.now(timezone.utc).isoformat(),
                "refreshed_by": refreshed_by,
                "source_job_count": marker.get("job_count"),
                "source_last_seen": marker.get("last_seen"),
            },
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

    def fetch_new_role_skill_counts(
        self,
        companies: list[str],
        skills: list[str],
    ) -> dict[str, dict[str, int]]:
        """New-this-week (company × skill) role counts — the gap-alert signal (S3).

        Same (company × skill) matrix as fetch_skill_heatmap but restricted to
        jobs whose first_seen is within the last 7 days — the honest 'posted N new
        {skill} roles this week' number behind the /intel gap-alert strip. Cached
        _PULSE_TTL (tracks the same daily-scrape cadence as pulse).
        """
        matrix: dict[str, dict[str, int]] = {c: {s: 0 for s in skills} for c in companies}
        if not companies or not skills:
            return matrix

        cache_key = (frozenset(companies), frozenset(skills))
        now = time.monotonic()
        cached = _gap_signal_cache.get(cache_key)
        if cached is not None and (now - cached[0]) < _PULSE_TTL:
            return cached[1]

        week_marker = _fresh_cutoff_marker(7)
        job_rows = fetch_all_rows(
            self._db,
            table="jobs",
            columns="job_id, company_name",
            query_builder=lambda q: q.in_("company_name", companies).gte("first_seen", week_marker),
        )
        job_company: dict[str, str] = {
            r["job_id"]: r["company_name"]
            for r in job_rows
            if r.get("job_id") and r.get("company_name")
        }
        if not job_company:
            _gap_signal_cache[cache_key] = (time.monotonic(), matrix)
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

        _gap_signal_cache[cache_key] = (time.monotonic(), matrix)
        return matrix

    def fetch_company_pulse(self, companies: list[str]) -> list[dict[str, Any]]:
        """Per-company demand pulse (Signal Thread S2) — ONE batched scan.

        Reads every job for the requested companies (first_seen / last_seen
        markers only) and derives, per company: open_roles (live = last_seen
        within the freshness window), weekly_delta (first_seen in the last 7d), a
        30-point trailing-inflow sparkline, and the 0-100 pulse from
        `company_pulse.compute_pulse`. Every number is real — a company with no
        live roles gets pulse=None (the em-dash state), never a fabricated 0.

        Shared across every replica via `shared_cache` (ARCHITECTURE_READ_PATH.md
        S3), keyed on the exact company set: fresh for _PULSE_TTL, then served
        stale immediately for another _PULSE_TTL while ONE replica refreshes in
        the background — measured on prod at up to 10,915ms cold, the shape a
        naive per-process TTL cache stampedes on every expiry.
        Order follows the input list (caller's ordering) even on a cache hit.
        """
        names = [c.strip() for c in companies if c and c.strip()]
        if not names:
            return []

        cache_key = "pulse:" + ",".join(sorted({n.casefold() for n in names}))

        def _compute() -> list[dict[str, Any]]:
            rows = fetch_all_rows(
                self._admin_db,
                table="jobs",
                columns="company_name, first_seen, last_seen",
                query_builder=lambda q: q.in_("company_name", names),
            )

            fresh_marker = _fresh_cutoff_marker(STALE_AFTER_DAYS)  # live floor
            week_marker = _fresh_cutoff_marker(7)  # new-this-week floor
            now_dt = datetime.now(timezone.utc)

            open_roles: dict[str, int] = {name: 0 for name in names}
            weekly_delta: dict[str, int] = {name: 0 for name in names}
            last_seen: dict[str, datetime] = {}
            offsets: dict[str, list[int]] = {name: [] for name in names}
            # Resolve each row's company back to the exact requested-name casing
            # so a scrape-side case variant still lands in the right bucket.
            by_key = {" ".join(n.casefold().split()): n for n in names}
            for r in rows:
                raw = (r.get("company_name") or "").strip()
                name = by_key.get(" ".join(raw.casefold().split()))
                if name is None:
                    continue
                last_m = _marker_int(r.get("last_seen"))
                first_m = _marker_int(r.get("first_seen"))
                if last_m is not None and last_m >= fresh_marker:
                    open_roles[name] += 1
                if first_m is not None and first_m >= week_marker:
                    weekly_delta[name] += 1
                seen_dt = _marker_to_dt(r.get("last_seen")) or _marker_to_dt(r.get("first_seen"))
                if seen_dt is not None:
                    prev = last_seen.get(name)
                    if prev is None or seen_dt > prev:
                        last_seen[name] = seen_dt
                first_dt = _marker_to_dt(r.get("first_seen"))
                if first_dt is not None:
                    days_ago = (now_dt - first_dt).days
                    if 0 <= days_ago < SERIES_DAYS:
                        offsets[name].append((SERIES_DAYS - 1) - days_ago)

            computed: list[dict[str, Any]] = []
            for name in names:  # preserve caller order
                seen = last_seen.get(name)
                days_since = (now_dt - seen).days if seen else None
                computed.append(
                    {
                        "company_name": name,
                        "open_roles": open_roles[name],
                        "weekly_delta": weekly_delta[name],
                        "pulse": compute_pulse(open_roles[name], weekly_delta[name], days_since),
                        "series": build_series(offsets[name]),
                        "last_seen_at": seen.isoformat() if seen else None,
                    }
                )
            return computed

        try:
            out = shared_cache.get_or_compute(
                cache_key, _compute, ttl_seconds=_PULSE_TTL, stale_seconds=_PULSE_TTL
            )
        except APIError:
            # Cold cache, no stale value to fall back to — mirrors the pre-
            # shared_cache contract (fetch_skill_heatmap does the same).
            return []
        by_name = {row["company_name"]: row for row in out}
        return [by_name[name] for name in names if name in by_name]

    def fetch_indexable_companies(self) -> list[dict[str, Any]]:
        """Companies whose /companies/{name} page renders real content — i.e.
        has >=1 job passing the SAME live filter the detail page uses
        (``is_active AND listing_confidence='active'``). This is the SEO-indexing
        allowlist: the sitemap emits only these, and the detail page noindexes
        itself when it falls out (see app/companies/[slug]/page.tsx). A company
        with only delisted/unverified rows is a thin shell Google crawls then
        drops as "Crawled - currently not indexed" — omitting it protects crawl
        budget for the pages that earn indexing.

        ONE grouped read (``indexable_companies`` RPC). Shared across every
        replica via `shared_cache` (ARCHITECTURE_READ_PATH.md S3) — fresh for
        `_INDEXABLE_TTL`, then served stale immediately for another
        `_INDEXABLE_TTL` while ONE replica refreshes in the background, so a
        TTL expiry is never a stampede of every replica recomputing at once.

        It used to page every matching row out at 1,000 per request and count
        them here — 11,208 rows in 12 OFFSET round trips to produce 185. OFFSET
        re-scans what it skips, so the last page cost 1,343 ms on its own and
        the endpoint spiked to 9-12s; the GROUP BY answers in ~350 ms.
        Grouping/ordering live in the function and match what this loop did.
        A cold miss with no stale value to fall back on propagates APIError to
        the caller, same as before this cache moved to shared_cache.
        """

        def _compute() -> list[dict[str, Any]]:
            rows = self._admin_db.rpc("indexable_companies", {}).execute().data or []
            return [
                {"name": name, "active_count": int(r.get("active_count") or 0)}
                for r in rows
                if (name := (r.get("name") or "").strip())
            ]

        # A stale entry is returned by shared_cache before this can raise. With
        # no last-known-good value, propagate the cold-cache failure so the
        # public route can identify it as unavailable rather than inventing an
        # empty directory.
        return shared_cache.get_or_compute(
            "indexable_companies",
            _compute,
            ttl_seconds=_INDEXABLE_TTL,
            stale_seconds=_INDEXABLE_TTL,
        )

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
                    "date_posted, first_seen, last_seen"
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

    def list_top_companies_at(
        self,
        *,
        industry: str | None = None,
        city: str | None = None,
        limit: int = 8,
        sort_by: Literal["roles", "last_seen"] = "roles",
    ) -> list[dict[str, Any]]:
        """Top companies hiring within an industry group or a city.

        Powers the /intel Industries/Cities right panel (Q1=B). Filters jobs by
        industry_group OR location_city, groups by company, returns the top-N by
        open count or latest scrape date with dominant country + most-recent
        last_seen per company. 24h in-process cache keyed on (kind, value, sort,
        limit). Mirrors the
        list_jobs_at_company read pattern (admin_db, APIError → cached/[]).
        """
        if industry:
            kind, value = "industry", _norm_filter(industry)
        else:
            # Canonicalize the freeform city label the same way the feed/movers do
            # (build_location_scope → normalize_location). The user's saved label
            # ("Bangalore") must hit the canonical DB city ("Bengaluru") or this
            # exact-match eq returns 0 and trending silently empties.
            raw_city = _norm_filter(city)
            kind, value = "city", (normalize_location(raw_city).location_city or raw_city) if raw_city else None
        if not value:
            return []
        scoped_limit = max(1, min(20, int(limit)))
        order = sort_by if sort_by in {"roles", "last_seen"} else "roles"
        cache_key = (f"__companies_at_{kind}_{order}__", value, None, None, None, None, 1, scoped_limit)
        now = time.monotonic()
        cached = _search_cache.get(cache_key)
        if cached is not None and (now - cached[0]) < _SEARCH_TTL:
            return list(cached[1]["rows"])
        try:
            query = (
                self._admin_db
                .table("jobs")
                .select("company_name, location_country, first_seen, last_seen")
            )
            query = query.eq("industry_group", value) if kind == "industry" else query.eq("location_city", value)
            result = query.execute()
        except APIError:
            return list(cached[1]["rows"]) if cached else []

        counts: Counter[str] = Counter()
        country_counters: dict[str, Counter[str]] = {}
        last_seen: dict[str, datetime] = {}
        for r in result.data or []:
            company = (r.get("company_name") or "").strip()
            if not company:
                continue
            counts[company] += 1
            country = (r.get("location_country") or "").strip()
            if country:
                country_counters.setdefault(company, Counter())[country] += 1
            seen_dt = _marker_to_dt(r.get("last_seen")) or _marker_to_dt(r.get("first_seen"))
            if seen_dt is not None:
                prev = last_seen.get(company)
                if prev is None or seen_dt > prev:
                    last_seen[company] = seen_dt

        rows = [
            {
                "company_name": company,
                "open_count": count,
                "location_country": _dominant(country_counters.get(company)),
                "last_seen_at": last_seen[company].isoformat() if company in last_seen else None,
            }
            for company, count in counts.items()
        ]
        if order == "last_seen":
            rows = sorted(
                rows,
                key=lambda row: (
                    last_seen.get(row["company_name"], datetime.min.replace(tzinfo=timezone.utc)),
                    int(row["open_count"]),
                ),
                reverse=True,
            )
        else:
            rows = sorted(rows, key=lambda row: int(row["open_count"]), reverse=True)
        rows = rows[:scoped_limit]
        _search_cache[cache_key] = (now, {"rows": rows})
        return rows

    def global_job_search(self, q: str, *, limit: int = 12) -> list[dict[str, Any]]:
        """Intent-aware public search across real job rows.

        Public ⌘K/live-data surface. Natural user phrases such as
        "post MBA roles in Gurugram" are expanded into a small set of role and
        location terms, then ranked locally from real rows. This keeps the
        surface forgiving without fabricating any jobs.
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
        terms = _global_search_terms(term) or [term.casefold()]
        location_terms = _global_search_location_terms(term)
        location_term_set = set(location_terms)
        role_terms = [search_term for search_term in terms if search_term not in location_term_set]
        # Matching runs against `job_search_index` — the same five fields
        # concatenated into one narrow row — then joins back to `jobs` by PK for
        # only the surviving window. The previous shape was a five-column ILIKE
        # OR over `jobs` itself, which had to fetch every match (16,364 rows /
        # 10,840 heap blocks of a 563MB table for "engineer") purely to sort by
        # first_seen and keep 96. Measured on prod: 4,284ms -> 177ms, and rare
        # terms 12,415ms -> 22ms. The candidate window is unchanged — the newest
        # N matches — and `_global_search_rank` below still does the ranking.
        try:
            result = self._admin_db.rpc(
                "search_jobs_global",
                {"p_terms": terms, "p_limit": max(scoped_limit * 8, 50)},
            ).execute()
        except APIError:
            return list(cached[1]["rows"]) if cached else []
        candidate_rows = [
            row for row in (result.data or [])
            if _global_search_rank(row, terms) > 0
        ]
        if location_terms:
            location_rows = [
                row for row in candidate_rows
                if _global_search_location_match(row, location_terms)
                and (not role_terms or _global_search_rank(row, role_terms) > 0)
            ]
            rows = location_rows or [
                row for row in candidate_rows
                if not role_terms or _global_search_rank(row, role_terms) > 0
            ]
        else:
            rows = candidate_rows
        rows = sorted(
            rows,
            key=lambda row: (
                _global_search_rank(row, terms),
                str(row.get("first_seen") or ""),
            ),
            reverse=True,
        )[:scoped_limit]
        for row in rows:
            _hydrate_location_fields(row)
        _search_cache[cache_key] = (now, {"rows": rows})
        return rows

    def public_job_query(
        self,
        *,
        role: str,
        location_city: str | None = None,
        location_country: str | None = None,
        location_mode: str | None = None,
        limit: int = 12,
    ) -> dict[str, Any]:
        """Public NL job search (#33 job-gen) → REAL openings only.

        Searches live job titles/companies by role text, then filters by location.
        Closest-rec fallback (#33 Q3 thin-market): if the strict location filter is
        too thin, relax location and report it, so the user still sees the nearest
        real roles instead of an empty page. Never fabricates — every returned card
        is a real `jobs` row.
        """
        min_results = 3  # below this, relax rather than show a near-empty page
        role_term = " ".join((role or "").split())
        rows = self.global_job_search(role_term, limit=60) if role_term else []
        relaxed: list[str] = []

        has_loc = bool(location_city or location_country or location_mode)
        if has_loc:
            strict = [
                r
                for r in rows
                if _matches_location_filters(
                    r,
                    location_city=location_city,
                    location_country=location_country,
                    location_mode=location_mode,
                )
            ]
            if len(strict) >= min_results:
                chosen = strict
            else:
                # Closest rec — keep the real role matches, drop the location filter.
                chosen = rows
                relaxed.append("location")
        else:
            chosen = rows

        bounded = max(1, min(24, int(limit)))
        return {
            "rows": chosen[:bounded],
            "total": len(chosen),
            "relaxed": relaxed,
        }

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
                "location, location_raw, location_city, location_country, location_mode, location_quality, locations"
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

    # ── authed /market browse feed ──────────────────────────────────────────────

    _FEED_COLUMNS = (
        # J0 card truth only. The full JD averages several KB and is fetched by
        # the detail endpoint after explicit user intent; pulling it for the
        # 500-row personal candidate pool dominated feed transfer and JSON
        # decoding, then saturated every other read during a browsing burst.
        "job_id, job_title, company_name, "
        "location, location_raw, location_city, location_country, location_mode, location_quality, locations, "
        "role_domain, career_band, industry, industry_group, apply_url, first_seen, last_seen, "
        "seniority_level, min_years_experience, max_years_experience, "
        "is_active, listing_confidence, last_verified_live_at, main_skills"
    )
    _FEED_PERSONAL_CAP = 500  # bound the in-Python overlap rank set

    @staticmethod
    def _feed_shape_row(
        row: dict[str, Any],
        user_skill_keys: set[str] | None,
        role_token_sets: list[set[str]] | None = None,
    ) -> dict[str, Any]:
        _hydrate_location_fields(row)
        raw_skills = [s.strip() for s in (row.get("main_skills") or []) if s and s.strip()]
        skills = raw_skills[:5]
        # Which of THIS job's skills the user's CV covers — by display name, so the
        # card can mark each chip ✓matched / ✗missing (T3-1). The frontend derives
        # "missing" as the shown skills not in this set; we keep the count too for
        # the fit pill.
        matched_skills: list[str] = []
        if user_skill_keys:
            matched_skills = [s for s in raw_skills if s.lower() in user_skill_keys]
        matched = len(matched_skills)
        role_match = _role_match_score(
            row.get("job_title"), row.get("role_domain"), role_token_sets or []
        )
        return {
            "job_id": row.get("job_id"),
            "job_title": row.get("job_title") or "",
            "company_name": row.get("company_name"),
            "job_description": row.get("job_description"),
            "location": row.get("location"),
            "location_city": row.get("location_city"),
            "location_country": row.get("location_country"),
            "location_mode": row.get("location_mode"),
            "location_quality": row.get("location_quality"),
            "locations": [c for c in (row.get("locations") or []) if c and c.strip()],
            "role_domain": row.get("role_domain"),
            "career_band": career_band_for_job(row) or None,
            "seniority_level": seniority_for_job(row) or None,
            "min_years_experience": row.get("min_years_experience"),
            "max_years_experience": row.get("max_years_experience"),
            "industry": row.get("industry_group") or row.get("industry"),
            "source_url": row.get("apply_url"),
            "first_seen": _job_feed_marker_to_iso(row.get("first_seen")),
            "last_seen_at": _job_feed_marker_to_iso(row.get("last_seen")),
            "is_stale": _is_marker_stale(row.get("last_seen")),
            "is_active": bool(row.get("is_active", True)),
            "listing_confidence": row.get("listing_confidence"),
            "last_verified_live_at": row.get("last_verified_live_at"),
            "skills": skills,
            "matched_skills": matched_skills,
            "matched_skill_count": matched,
            "target_role_match": role_match,
        }

    def feed_jobs(
        self,
        *,
        role_domain: str | None = None,
        q: str | None = None,
        skill: str | None = None,
        location_city: str | None = None,
        location_country: str | None = None,
        location_mode: str | None = None,
        location_prefs: list[str] | None = None,
        sort: str = "fresh",
        user_skill_keys: set[str] | None = None,
        user_target_roles: list[str] | None = None,
        primary_career_band: str | None = None,
        explored_career_bands: list[str] | None = None,
        target_seniority: str = "any",
        include_stretch: bool = False,
        min_skill_matches: int | None = None,
        following_only: bool = False,
        followed_companies: set[str] | None = None,
        exclude_job_ids: set[str] | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        """Company-agnostic triage feed for the authed /market page. No LLM scoring.

        sort (the user's rank lens):
          'fresh'    — first_seen desc.
          'fit'      — composite skill·role·fresh blend (data-aware weights).

        Narrowing filters:
          min_skill_matches  — keep only jobs sharing ≥N of the user's CV skills.
          following_only      — keep only jobs at companies the user follows.
          exclude_job_ids     — drop jobs the user has already saved or skipped
                                (the draining-queue model: the feed only shows
                                roles the user has not yet decided on).

        Computed-signal work (skill overlap, role match, exclusion) only exists
        after a row is shaped, so the `fit` sort, the min_skill filter, or a
        non-empty exclusion routes through the in-Python candidate path (bounded
        to the freshest CAP: available_total reflects the candidate cap, not the
        full DB pool). Pure `fresh` browsing with nothing to exclude stays
        DB-paginated with a true count — that path is only ever hit by users who
        have not yet saved or skipped anything.

        location_prefs supersedes the single city/country/mode filters with an
        OR-across-chips scope (geo is fixed from settings, not re-picked).
        """
        scoped_page = _bounded_page(page)
        scoped_page_size = _bounded_page_size(page_size)
        mode = sort if sort in {"fresh", "fit"} else "fresh"
        domain = _norm_filter(role_domain)
        scope_clause, scope_sig = build_location_scope(location_prefs)
        # Pref scope (fixed-from-settings) supersedes ad-hoc single filters.
        if scope_clause is not None:
            country = city = loc_mode = None
        else:
            country = _norm_filter(location_country)
            city = _norm_filter(location_city)
            loc_mode = _norm_filter(location_mode)
        term = " ".join((q or "").split())
        # Only terms ≥2 chars filter; fold shorter terms to "" so they share the
        # unfiltered cache slot and stay part of the key for ≥2-char terms.
        effective_term = term if len(term) >= 2 else ""
        search_patterns = _feed_search_patterns(effective_term)
        # Skill facet — Scoped Skill Demand's filter half. A first-class dimension
        # (the canonical skill name, matched against the row's main_skills mirror),
        # NOT folded into the free-text `q` (which only hits job_title/company_name).
        # This is the same predicate scoped_skill_demand_counts() counts, so the
        # rail's mover badge and the feed it lands on cannot disagree.
        skill_facet = (skill or "").strip()
        now = time.monotonic()

        role_token_sets = _role_token_sets(user_target_roles)
        min_skill = min_skill_matches if (min_skill_matches and min_skill_matches > 0) else 0
        # following_only with no follows → an empty feed is the honest answer
        # (IH1: the user's heatmap/follow set is theirs; no global default).
        follow_scope: list[str] | None = None
        if following_only:
            follow_scope = sorted({c for c in (followed_companies or set()) if c})
            if not follow_scope:
                return _empty_feed(mode, scoped_page, scoped_page_size)
        follow_sig = ",".join(follow_scope) if follow_scope is not None else ""
        exclude = {str(j) for j in (exclude_job_ids or set()) if j}
        eligibility_profile = {
            "target_career_band": primary_career_band,
            "explored_career_bands": explored_career_bands or [],
            "target_seniority": target_seniority,
        }
        eligibility_active = bool(primary_career_band) or target_seniority not in {"", "any"}

        # DB-level filters are user-independent (shareable cache); exclusion +
        # computed filters are per-user and run after shaping.
        def _apply_filters(query: Any) -> Any:
            query = query.eq("is_active", True).eq("listing_confidence", "active")
            if skill_facet:
                # Array-contains on the canonical skill name. main_skills mirrors
                # job_skills (CLAUDE.md: back-compat name mirror == [all names]).
                query = query.contains("main_skills", [skill_facet])
            if domain:
                query = query.eq("role_domain", domain)
            if scope_clause is not None:
                query = query.or_(scope_clause)
            if country:
                query = query.eq("location_country", country)
            if city:
                query = query.eq("location_city", city)
            if loc_mode:
                query = query.eq("location_mode", loc_mode)
            if follow_scope is not None:
                query = query.in_("company_name", follow_scope)
            if search_patterns:
                clauses = [
                    f"{column}.ilike.%{pattern}%"
                    for pattern in search_patterns
                    for column in ("job_title", "company_name", "job_description")
                ]
                query = query.or_(",".join(clauses))
            return query

        wants_inpython = mode == "fit" or min_skill > 0 or bool(exclude) or eligibility_active

        if wants_inpython:
            # Load + cache the freshest CAP candidates (raw rows, no per-user
            # data → shared across users on the same filter set). Per-user
            # shaping, exclusion and computed filters run below the cache.
            pkey = (domain, city, country, loc_mode, scope_sig, follow_sig, effective_term, skill_facet)
            def _load_feed_candidates() -> list[dict[str, Any]]:
                try:
                    result = _apply_filters(
                        self._admin_db.table("jobs").select(self._FEED_COLUMNS)
                    ).order("first_seen", desc=True).limit(self._FEED_PERSONAL_CAP).execute()
                except APIError:
                    result = None
                return (result.data if result else None) or []

            # Cold bursts used to let every caller that lost the shared-cache
            # claim repeat this same 500-row query. One user arrival therefore
            # became ten identical scans and queued unrelated J0 reads behind
            # PostgREST's finite session pool. The shared mapping now waits for
            # one bounded winner and all peers reuse its raw (user-independent)
            # candidate rows.
            rows = _feed_personal_cache.get_or_compute(pkey, _load_feed_candidates)

            shaped = [self._feed_shape_row(r, user_skill_keys, role_token_sets) for r in rows]
            if eligibility_active:
                shaped = [
                    row for row in shaped
                    if job_is_browse_eligible(eligibility_profile, row, include_stretch=include_stretch)
                ]
            if exclude:
                shaped = [r for r in shaped if r["job_id"] not in exclude]
            if min_skill > 0:
                shaped = [r for r in shaped if r["matched_skill_count"] >= min_skill]

            # Stable sort: lay down the freshest order, then the primary fit key
            # on top so equal-fit jobs stay newest-first.
            shaped.sort(key=lambda r: (r["first_seen"] or ""), reverse=True)
            if mode == "fit":
                fit_scores = _fit_scores(
                    shaped,
                    has_cv=bool(user_skill_keys),
                    has_roles=bool(role_token_sets),
                    num_target_roles=len(role_token_sets),
                )
                shaped.sort(key=lambda r: fit_scores[r["job_id"]], reverse=True)

            available_total = len(shaped)
            start = (scoped_page - 1) * scoped_page_size
            end = start + scoped_page_size
            page_rows = shaped[start:end] if start < available_total else []
            return {
                "rows": page_rows,
                "available_total": available_total,
                "returned_total": len(page_rows),
                "page": scoped_page,
                "page_size": scoped_page_size,
                "has_next_page": (start + len(page_rows)) < available_total,
                "sort": mode,
            }

        # DB-paginated browse: fresh, nothing computed, nothing excluded.
        start = (scoped_page - 1) * scoped_page_size
        end = start + scoped_page_size - 1
        ckey = (mode, domain, city, country, loc_mode, scope_sig, follow_sig, effective_term, skill_facet, scoped_page, scoped_page_size)
        cached = _feed_page_cache.get(ckey)
        if cached is not None and (now - cached[0]) < _FEED_TTL:
            rows, available_total = cached[1]
        else:
            try:
                base = _apply_filters(
                    self._admin_db.table("jobs").select(self._FEED_COLUMNS, count="exact")
                ).order("first_seen", desc=True).order("job_id", desc=True)
                result = base.range(start, end).execute()
            except APIError:
                return {
                    "rows": [], "available_total": 0, "returned_total": 0,
                    "page": scoped_page, "page_size": scoped_page_size,
                    "has_next_page": False, "sort": mode,
                }
            rows = result.data or []
            available_total = result.count if result.count is not None else len(rows)
            _feed_page_cache[ckey] = (now, (rows, available_total))
        page_rows = [self._feed_shape_row(r, user_skill_keys, role_token_sets) for r in rows]
        return {
            "rows": page_rows,
            "available_total": available_total,
            "returned_total": len(page_rows),
            "page": scoped_page,
            "page_size": scoped_page_size,
            "has_next_page": (start + len(page_rows)) < available_total,
            "sort": mode,
        }

    def user_skill_keys(self, user_id: str) -> set[str]:
        """Lowercased taxonomy_key + display_name set for the user's CV skills.

        Cached per user on a short TTL: every feed call needs this set, but CV
        skills only change on edit/re-upload, so the user_skills round-trip is
        pure waste on repeat browses.
        """
        now = time.monotonic()
        cached = _user_skill_keys_cache.get(user_id)
        if cached is not None and (now - cached[0]) < _USER_SKILL_KEYS_TTL:
            return set(cached[1])
        keys: set[str] = set()
        for row in self.get_user_skills_with_taxonomy(user_id):
            sk = row.get("skills") or {}
            for field in ("taxonomy_key", "display_name"):
                val = (sk.get(field) or "").strip().lower()
                if val:
                    keys.add(val)
        _user_skill_keys_cache[user_id] = (now, sorted(keys))
        return keys

    def get_feed_context(self) -> dict[str, Any]:
        """All current-user state required before the J0 feed query, in one RPC."""
        result = self._db.rpc("current_user_feed_context", {}).execute()
        data = result.data or {}
        if isinstance(data, list):
            data = data[0] if data else {}
        profile = data.get("eligibility_profile") or {}
        return {
            "skill_keys": {
                str(value) for value in (data.get("skill_keys") or []) if value
            },
            "target_roles": data.get("target_roles") or [],
            "dismissed": data.get("dismissed_job_ids") or [],
            "saved": data.get("saved_job_ids") or [],
            "location_prefs": data.get("target_locations") or [],
            "location_countries": data.get("target_location_countries") or [],
            "eligibility": {
                "target_career_band": career_band_for_profile(profile) or None,
                "explored_career_bands": profile.get("explored_career_bands") or [],
                "target_seniority": target_seniority_for_profile(profile),
            },
        }

    _AGENT_PICK_JOB_COLUMNS = (
        "job_id, job_title, company_name, job_description, industry, industry_group, "
        "role_domain, apply_url, location, location_raw, location_city, location_country, "
        "location_mode, location_quality, locations, main_skills, first_seen, last_seen, "
        "is_active, listing_confidence, last_verified_live_at"
    )

    def get_agent_picks(self, user_id: str) -> list[dict[str, Any]]:
        """Career-Ops "Agent Picks" — the curated editorial shortlist that sits
        ABOVE the algorithm feed (see migration 20260709_agent_job_picks).

        Distinct from the algorithm layer (`user_job_matches`, rewritten on every
        recompute): these are hand-vetted picks that survive recompute. Rows are
        shaped exactly like feed rows (via `_feed_shape_row`) so the card renders
        identically to a normal feed card. A pick whose job has since delisted is
        dropped from the view — never a dead card.
        """
        pick_rows = (
            self._db.table("user_agent_job_picks")
            .select("job_id, agent_rank, tier, comment")
            .eq("user_id", user_id)
            .order("agent_rank")
            .execute()
            .data
            or []
        )
        if not pick_rows:
            return []
        job_ids = [r["job_id"] for r in pick_rows]
        job_rows = (
            self._db.table("jobs")
            .select(self._AGENT_PICK_JOB_COLUMNS)
            .in_("job_id", job_ids)
            .eq("is_active", True)
            .eq("listing_confidence", "active")
            .execute()
            .data
            or []
        )
        jobs_by_id = {r["job_id"]: r for r in job_rows}
        skill_keys = self.user_skill_keys(user_id)
        out: list[dict[str, Any]] = []
        for pr in pick_rows:
            jr = jobs_by_id.get(pr["job_id"])
            if not jr:  # delisted since the pick was cut → drop it from the view
                continue
            item = self._feed_shape_row(jr, skill_keys, [])
            item["agent_rank"] = pr.get("agent_rank")
            item["agent_tier"] = pr.get("tier")
            item["agent_comment"] = pr.get("comment") or ""
            out.append(item)
        return out

    def record_recommendation_exposures(
        self,
        user_id: str,
        rows: list[dict[str, Any]],
        *,
        surface: str,
    ) -> int:
        """Best-effort ledger of jobs returned on a recommendation surface."""
        if surface not in {
            "dashboard", "market", "collections", "agent_pick",
            "notification", "other",
        }:
            raise ValueError(f"Unsupported recommendation surface: {surface}")
        payload: list[dict[str, Any]] = []
        for position, row in enumerate(rows, start=1):
            job = row.get("jobs") or row
            if not is_recommendable_listing(job):
                continue
            job_id = str(row.get("job_id") or job.get("job_id") or "")
            if not job_id:
                continue
            match_id = row.get("id")
            payload.append(
                {
                    "user_id": user_id,
                    "job_id": job_id,
                    "surface": surface,
                    "confidence_at_show": "active",
                    "verified_live_at": job.get("last_verified_live_at"),
                    "match_id": match_id if isinstance(match_id, int) else None,
                    "metadata": {"position": position},
                }
            )
        if not payload:
            return 0
        # A reload or a multi-replica cache miss can return the same page many
        # times together. One exposure window is enough to preserve "shown"
        # truth and verifier priority; duplicate inserts only multiply writes
        # and trigger work after the response. Sort ids so page-order jitter
        # does not defeat the claim.
        exposure_key = ":".join(
            ["job_exposure", user_id, surface]
            + sorted(row["job_id"] for row in payload)
        )
        if not debounce.claim(exposure_key, ttl_seconds=60):
            return 0
        try:
            self._admin_db.table("job_recommendation_exposures").insert(
                payload
            ).execute()
        except APIError as exc:
            _log.warning("metric job_exposure.write_failed rows=%d error=%s", len(payload), exc)
            return 0
        return len(payload)

    def replace_agent_picks(
        self, user_id: str, picks: list[dict[str, Any]], scrape_batch: int | None = None
    ) -> int:
        """Cut a fresh Agent Picks set for one user (Backlog #36 N5 auto-gen).

        Picks are a per-scrape recommendation set (migration 20260709), so a new
        generation REPLACES the prior one wholesale — delete-then-insert, not an
        upsert-and-orphan. Service-role only (the table has no client write
        policy). `picks` are already selected + ranked by the agent_picks service;
        an empty list clears the band. Returns rows written.
        """
        self._admin_db.table("user_agent_job_picks").delete().eq("user_id", user_id).execute()
        if not picks:
            return 0
        rows = [
            {
                "user_id": user_id,
                "job_id": str(p["job_id"]),
                "agent_rank": int(p["agent_rank"]),
                "tier": p.get("tier"),
                "comment": p["comment"],
                "scrape_batch": scrape_batch,
            }
            for p in picks
        ]
        self._admin_db.table("user_agent_job_picks").insert(rows).execute()
        return len(rows)

    def user_target_locations(self, user_id: str) -> list[str]:
        """The user's saved multi-location preference (freeform labels).

        Falls back to the legacy single `target_location` for rows not yet
        backfilled. Cached per user on a short TTL — every feed page needs it but
        prefs only change via Settings.
        """
        now = time.monotonic()
        cached = _user_target_locations_cache.get(user_id)
        if cached is not None and (now - cached[0]) < _USER_TARGET_LOCATIONS_TTL:
            return cached[1]
        data = safe_read(
            self._db.table("user_profiles")
            .select("target_locations, target_location")
            .eq("id", user_id)
            .maybe_single(),
            default=None,
            context="user_target_locations",
        ) or {}
        locations = [loc for loc in (data.get("target_locations") or []) if loc and loc.strip()]
        if not locations and data.get("target_location"):
            locations = [data["target_location"]]
        _user_target_locations_cache[user_id] = (now, locations)
        return locations

    def user_target_location_countries(self, user_id: str) -> list[str]:
        result = (
            self._db.table("user_profiles")
            .select("target_location_countries, target_location_country")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        data = (result.data if result else None) or {}
        countries = [
            str(value).strip()
            for value in (data.get("target_location_countries") or [])
            if str(value).strip()
        ]
        if not countries and data.get("target_location_country"):
            countries = [str(data["target_location_country"]).strip()]
        return list(dict.fromkeys(countries))

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
        job_count, weighted_demand = self._job_demand_counts(skill_ids)

        return [
            {
                **skill_meta,
                "job_count_30d": job_count.get(skill_id, 0),
                "weighted_demand": weighted_demand.get(skill_id, 0),
            }
            for skill_id, skill_meta in user_skills_by_id.items()
        ]

    def _job_demand_counts(self, skill_ids: list[int]) -> tuple[dict[int, int], dict[int, int]]:
        """(job_count, weighted_demand) per skill_id.

        Primary path = the count_job_demand_for_skills GROUP BY RPC (one indexed
        scan + group; migration 20260613_job_demand_counts_rpc). Fallback = the
        old fetch-all-rows-then-count-in-Python path, kept so the backend is
        correct before the migration is applied. The fallback is the documented
        degradation: it is the slow path issue #21(1b) exists to retire, so a
        miss is logged once per process, not silently.
        """
        if not skill_ids:
            return {}, {}
        try:
            result = self._db.rpc(
                "count_job_demand_for_skills", {"p_skill_ids": skill_ids}
            ).execute()
            rows = result.data or []
            job_count = {int(r["skill_id"]): int(r["job_count"]) for r in rows}
            weighted = {int(r["skill_id"]): int(r["weighted_demand"]) for r in rows}
            return job_count, weighted
        except APIError as exc:
            _warn_demand_rpc_fallback(exc)

        demand_rows = fetch_all_rows(
            self._db,
            table="job_skills",
            columns="skill_id, is_primary",
            query_builder=lambda q, _skill_ids=skill_ids: q.in_("skill_id", _skill_ids),
        )
        job_count = {skill_id: 0 for skill_id in skill_ids}
        weighted_demand = {skill_id: 0 for skill_id in skill_ids}
        for row in demand_rows:
            try:
                skill_id = int(row.get("skill_id"))
            except (TypeError, ValueError):
                continue
            if skill_id not in job_count:
                continue
            weighted_demand[skill_id] += 2 if row.get("is_primary") else 1
            job_count[skill_id] += 1
        return job_count, weighted_demand

    def scoped_skill_demand_counts(
        self, skill_displays: list[str], *, location_prefs: list[str] | None = None
    ) -> dict[str, int]:
        """Scoped Skill Demand — active jobs per skill in the user's location scope.

        The COUNT half of the seam, mirroring feed_jobs' skill facet exactly:
        `is_active = true AND <location scope> AND skill ∈ main_skills`. Because
        both read the same predicate, the market rail's mover badge equals the
        feed it links to (modulo the draining-queue triage drop, same honesty
        contract as any feed available_total).

        One indexed head-count per skill (no rows fetched). Callers pass only the
        handful of skills the rail will show, and cache the result.
        """
        scope_clause, _ = build_location_scope(location_prefs or [])
        out: dict[str, int] = {}
        for display in skill_displays:
            name = (display or "").strip()
            if not name:
                continue
            try:
                query = (
                    self._admin_db.table("jobs")
                    .select("job_id", count="exact")
                    .eq("is_active", True)
                    .contains("main_skills", [name])
                    .limit(1)
                )
                if scope_clause is not None:
                    query = query.or_(scope_clause)
                result = query.execute()
                out[name] = result.count or 0
            except APIError:
                out[name] = 0
        return out

    def get_all_jobs_skills(self) -> list[dict[str, Any]]:
        """Returns job skills from the FK-enforced job_skills join table."""
        return group_job_skill_rows(fetch_job_skill_rows(self._db))

    _LOCATION_FILTER_CHUNK = 200

    def _filter_job_ids_by_location(
        self,
        job_ids: list[str],
        target_location_countries: list[str],
    ) -> list[str]:
        """Hard-filter job_ids by target countries (OR across the set).

        Include if location_country is in the target set OR (location_country is
        NULL AND mode is remote/hybrid). Queries in chunks of 200 to stay within
        PostgREST URL limits.
        """
        countries_lower = {c.strip().lower() for c in target_location_countries if c and c.strip()}
        if not countries_lower:
            return list(job_ids)
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
                if country and country in countries_lower:
                    result.append(row["job_id"])
                elif not country and mode in ("remote", "hybrid"):
                    result.append(row["job_id"])
        return result

    def _filter_job_ids_by_recommendability(self, job_ids: list[str]) -> list[str]:
        """Keep only listings the verifier has explicitly marked active.

        ``last_seen`` is scraper observation history, not listing liveness. A
        source can stop being crawled while its listings remain live, so Career
        Ops must consume the verifier-owned ``is_active`` and
        ``listing_confidence`` fields instead. Queries stay chunked to keep
        PostgREST URLs bounded.
        """
        if not job_ids:
            return []
        result: list[str] = []
        for i in range(0, len(job_ids), self._LOCATION_FILTER_CHUNK):
            chunk = job_ids[i:i + self._LOCATION_FILTER_CHUNK]
            rows = (
                self._db.table("jobs")
                .select("job_id")
                .in_("job_id", chunk)
                .eq("is_active", True)
                .eq("listing_confidence", "active")
                .execute()
            ).data or []
            result.extend(r["job_id"] for r in rows)
        return result

    def get_candidate_job_ids_for_skills(
        self,
        skill_keys: list[str],
        *,
        target_location_countries: list[str] | None = None,
        require_fresh: bool = True,
    ) -> list[str]:
        """Job_ids that have at least one skill in skill_keys, filtered by target
        location and (by default) verifier-owned recommendation eligibility.

        target_location_countries: if non-empty, only jobs in one of those
        countries (or remote/hybrid with no country set) are returned. None or
        empty means no location filter.

        require_fresh: compatibility name for the trust gate. When True
        (default), only verifier-active listings reach the pool; scraper
        ``last_seen`` age is deliberately ignored. Set False only for callers
        that deliberately want the full history.
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

        located = (
            self._filter_job_ids_by_location(all_job_ids, target_location_countries)
            if target_location_countries
            else all_job_ids
        )
        if not require_fresh:
            return located

        recommendable = self._filter_job_ids_by_recommendability(located)
        return recommendable

    def get_candidate_job_ids_for_roles(
        self,
        role_titles: list[str],
        *,
        target_location_countries: list[str] | None = None,
        require_fresh: bool = True,
        limit: int = 400,
    ) -> list[str]:
        """career-ops title_filter as a candidate SELECTOR — jobs whose TITLE matches
        the user's target roles, independent of skill overlap.

        The skill-overlap selector (`get_candidate_job_ids_for_skills`) can never see a
        role-right job whose skills the taxonomy missed; this reaches it. Recall is an
        index-backed title ilike over the roles' significant tokens (GIN trigram index
        idx_jobs_job_title_trgm); precision is `_role_match_score` (ALL tokens of some
        role present in the title/role_domain — no fuzzy or fabricated relevance).
        Verifier eligibility + location gate the same way the skill selector
        does. Most recently verified first, capped. Returns [] when the user has
        no target roles (nothing to match on).
        """
        token_sets = _role_token_sets(role_titles)
        if not token_sets:
            return []
        positive = sorted({tok for toks in token_sets for tok in toks})
        or_clause = ",".join(f"job_title.ilike.%{tok}%" for tok in positive)
        query = (
            self._db.table("jobs")
            .select("job_id, job_title, role_domain, last_verified_live_at")
            .or_(or_clause)
        )
        if require_fresh:
            query = (
                query.eq("is_active", True)
                .eq("listing_confidence", "active")
            )
        rows = (
            query.order("last_verified_live_at", desc=True).limit(limit * 4).execute()
        ).data or []
        # Precision: keep only true role-title matches (all tokens of some role present).
        matched_ids = [
            r["job_id"]
            for r in rows
            if _role_match_score(r.get("job_title"), r.get("role_domain"), token_sets) > 0
        ]
        if target_location_countries:
            matched_ids = self._filter_job_ids_by_location(
                matched_ids, target_location_countries
            )
        return matched_ids[:limit]

    def filter_job_ids_for_eligibility(
        self,
        job_ids: list[str],
        *,
        profile: dict[str, Any],
        include_stretch: bool = False,
    ) -> list[str]:
        """Keep candidate IDs that pass the same gate as the browse feed."""
        if not job_ids:
            return []
        allowed = {
            str(job["job_id"])
            for job in self.get_jobs_by_ids(job_ids)
            if job.get("job_id") and job_is_eligible(profile, job, include_stretch=include_stretch)
        }
        return [job_id for job_id in job_ids if job_id in allowed]

    def get_all_job_skill_rows(self, *, job_ids: list[str] | None = None) -> list[dict[str, Any]]:
        """Raw job_skills JOIN skills rows for the matcher. No grouping."""
        return fetch_job_skill_rows(self._db, job_ids=job_ids)

    def get_job_description(self, job_id: str) -> str | None:
        """The full job_description for ONE job, and nothing else.

        Deliberately narrow: list payloads carry only a bounded snippet
        (`_shared.MATCH_JD_SNIPPET_CHARS`) because the full text averages 3,734
        chars and was 59.8% of the /jobs/matches payload. This is the on-demand
        other half, read only when a user actually opens the JD panel. Returns
        None for a missing job so the caller can 404 rather than render "".
        """
        rows = safe_read(
            self._db.table("jobs").select("job_description").eq("job_id", job_id).limit(1),
            default=[],
            context="get_job_description",
        )
        if not rows:
            return None
        return rows[0].get("job_description") or ""

    def get_jobs_by_ids(self, job_ids: list[str]) -> list[dict[str, Any]]:
        """Fetch job metadata for a specific list of job_ids."""
        if not job_ids:
            return []
        rows = (
            self._db.table("jobs")
            .select(
                "job_id, job_title, job_description, company_name, industry, "
                "location, location_raw, location_city, location_country, location_mode, location_quality, apply_url"
                ", role_domain, career_band, seniority_level, min_years_experience, max_years_experience"
            )
            .in_("job_id", job_ids)
            .execute()
        ).data or []
        for row in rows:
            _hydrate_location_fields(row)
        return rows

    def get_user_target_roles(self, user_id: str) -> list[str]:
        data = safe_read(
            self._db.table("user_profiles")
            .select("target_roles")
            .eq("id", user_id)
            .maybe_single(),
            default=None,
            context="user_target_roles",
        )
        return (data or {}).get("target_roles") or []

    def get_user_eligibility_preferences(self, user_id: str) -> dict[str, Any]:
        """Profile-backed Career Band and seniority gates for feed/ranking.

        A target band written by onboarding is preferred. Existing candidates are
        derived from their durable role titles until their next profile save;
        unknown profiles stay unclassified instead of receiving cross-band work.
        """
        data = safe_read(
            self._db.table("user_profiles")
            .select(
                "target_role_titles,target_role_title,target_roles,target_seniority,"
                "target_career_band,explored_career_bands"
            )
            .eq("id", user_id)
            .maybe_single(),
            default=None,
            context="user_eligibility_preferences",
        ) or {}
        return {
            "target_career_band": career_band_for_profile(data) or None,
            "explored_career_bands": data.get("explored_career_bands") or [],
            "target_seniority": target_seniority_for_profile(data),
        }

    # ── job matches ────────────────────────────────────────────────────────────

    def get_feed_updated_at(self) -> str | None:
        return get_feed_updated_at(self._db)

    def count_new_jobs_since(self, since: datetime) -> int:
        return count_jobs_ingested_after(self._db, since)

    def last_match_run_at(self, user_id: str) -> datetime | None:
        """When this user last RAN a match — the baseline for "new since your last
        search". None = never ran one (no baseline → nothing is "new" yet).

        Read from `user_profiles.last_match_run_at`, which only `match_run` writes.
        NOT from `MAX(user_job_matches.computed_at)`: that table is also written by
        `on_demand.ensure_job_eval` and the feed warmer, so browsing the feed used
        to silently reset the baseline and retire the announcement (QA: 7,112 → 0
        on a page load). Falls back to the old MAX for rows the backfill missed —
        wrong in the same old way, but never "everything is new", and it self-heals
        on the user's first run.
        """
        rows = safe_read(
            self._db.table("user_profiles").select("last_match_run_at").eq("id", user_id).limit(1),
            default=[],
            context="last_match_run_at",
        )
        marker = _parse_iso_dt(rows[0].get("last_match_run_at")) if rows else None
        if marker is not None:
            return marker

        legacy = (
            self._db.table("user_job_matches")
            .select("computed_at")
            .eq("user_id", user_id)
            .order("computed_at", desc=True)
            .limit(1)
            .execute()
        ).data or []
        return _parse_iso_dt(legacy[0].get("computed_at")) if legacy else None

    def mark_match_run(self, user_id: str, when: datetime | None = None) -> None:
        """Stamp the run marker. One writer (`match_run.run_match`) — that is the
        whole point of the column; widen this and the baseline rots again."""
        ts = (when or datetime.now(timezone.utc)).isoformat()
        self._db.table("user_profiles").update({"last_match_run_at": ts}).eq("id", user_id).execute()

    def has_computed_matches(self, user_id: str) -> bool:
        """Cheap existence check — has this user EVER had a match computed?

        Backlog #36 (de-weekly): distinguishes "never matched" (must always
        compute) from "matched, nothing new since" (safe to skip) — the two
        cases `count_new_jobs_for_user` alone can't tell apart (it returns 0
        for both a never-matched user and a fully-caught-up one).
        """
        rows = (
            self._db.table("user_job_matches")
            .select("job_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        ).data or []
        return bool(rows)

    def count_new_jobs_for_user(self, user_id: str) -> int:
        """Live jobs that landed since this user's last match compute.

        Server-authoritative — the one definition behind the /matches signal, the
        login notification, and the charge waiver. 0 for never-matched users (no
        baseline → nothing is "new"). Never trust a client-supplied "free" flag.

        One RPC deliberately owns marker fallback and counting. The previous
        implementation made two dependent network round trips (three for a
        profile without a marker), so it could not be hidden inside the
        /jobs/matches read wave even when the other sections were fast.
        """
        result = self._db.rpc(
            "count_new_jobs_for_user",
            {"p_user_id": user_id},
        ).execute()
        value = result.data
        if isinstance(value, list):
            value = value[0] if value else 0
            if isinstance(value, dict):
                value = next(iter(value.values()), 0)
        return int(value or 0)

    def get_new_job_ids_since(self, since: datetime) -> list[str]:
        """Job ids that landed after `since` — the deterministic candidate set for
        an admin sweep (Backlog #36). Same `ingested_at` truth as the counts."""
        rows = fetch_all_rows(
            self._db,
            table="jobs",
            columns="job_id",
            query_builder=lambda q: q.eq("is_active", True).gt("ingested_at", since.isoformat()),
        )
        return [r["job_id"] for r in rows if r.get("job_id")]

    def get_affected_user_ids(self, job_ids: list[str], *, limit: int) -> list[str]:
        """Deterministic pre-filter (Backlog #36 N4): users whose CV skills
        overlap ANY of the given (newly-scraped) job_ids, priority-ordered —
        users who follow one of the new jobs' companies (the scrape likely ran
        FOR them) come first, everyone else after — capped at `limit`.

        This is the cheap SQL gate that turns "every user" into "the few
        genuinely affected", before any LLM eval is queued. Bounded by `limit`
        so a hot-company scrape can't blow the shared LLM budget in one sweep.

        Reads the WHOLE batch in `_SWEEP_IN_CHUNK_SIZE` chunks — the chunk is a
        URL-length limit on one `in_()` call, never a sample of the batch. It used
        to slice `job_ids[:200]`, so a 30k-row landing resolved its audience (and
        its follow-priority) from an arbitrary 0.7% of itself, silently.
        """
        if not job_ids or limit <= 0:
            return []

        chunks = [
            job_ids[i : i + _SWEEP_IN_CHUNK_SIZE]
            for i in range(0, len(job_ids), _SWEEP_IN_CHUNK_SIZE)
        ]

        skill_ids: list[int] = []
        seen_skills: set[int] = set()
        for chunk in chunks:
            for row in fetch_all_rows(
                self._db,
                table="job_skills",
                columns="skill_id",
                query_builder=lambda q, c=chunk: q.in_("job_id", c),
            ):
                sid = row.get("skill_id")
                if sid is not None and sid not in seen_skills:
                    seen_skills.add(sid)
                    skill_ids.append(sid)
        if not skill_ids:
            return []

        us_rows = fetch_all_rows(
            self._db,
            table="user_skills",
            columns="user_id",
            query_builder=lambda q: q.in_("skill_id", skill_ids),
        )
        affected = list({r["user_id"] for r in us_rows if r.get("user_id")})
        if not affected:
            return []

        companies_seen: set[str] = set()
        for chunk in chunks:
            company_rows = (
                self._db.table("jobs")
                .select("company_name")
                .in_("job_id", chunk)
                .execute()
            ).data or []
            companies_seen.update(r["company_name"] for r in company_rows if r.get("company_name"))
        companies = list(companies_seen)
        power_ids: set[str] = set()
        if companies:
            follow_rows = (
                self._db.table("followed_companies")
                .select("user_id")
                .in_("company_name", companies)
                .in_("user_id", affected)
                .execute()
            ).data or []
            power_ids = {r["user_id"] for r in follow_rows if r.get("user_id")}

        ordered = sorted(affected, key=lambda uid: uid not in power_ids)  # power users first
        return ordered[:limit]

    def get_dismissed_job_card_ids(self, user_id: str) -> list[str]:
        result = (
            self._db.table("user_dismissed_job_cards")
            .select("job_id")
            .eq("user_id", user_id)
            .execute()
        )
        return [str(r["job_id"]) for r in (result.data or []) if r.get("job_id")]

    def get_dismissed_jobs(self, user_id: str) -> list[dict[str, Any]]:
        dismissed = (
            self._db.table("user_dismissed_job_cards")
            .select("job_id,dismissed_at")
            .eq("user_id", user_id)
            .order("dismissed_at", desc=True)
            .execute()
        ).data or []
        job_ids = [str(row["job_id"]) for row in dismissed if row.get("job_id")]
        jobs_by_id = {str(row["job_id"]): row for row in self.get_jobs_by_ids(job_ids)}
        return [
            {
                "job_id": job_id,
                "job_title": jobs_by_id.get(job_id, {}).get("job_title") or "Unavailable role",
                "company_name": jobs_by_id.get(job_id, {}).get("company_name"),
                "location": jobs_by_id.get(job_id, {}).get("location"),
                "dismissed_at": row.get("dismissed_at"),
            }
            for row in dismissed
            if (job_id := str(row.get("job_id") or ""))
        ]

    def get_existing_match_job_ids(self, user_id: str, batch_week: date | None = None) -> list[str]:
        query = self._db.table("user_job_matches").select("job_id").eq("user_id", user_id)
        if batch_week is not None:
            query = query.eq("batch_week", str(batch_week))
        result = query.execute()
        ids = [str(r["job_id"]) for r in (result.data or []) if r.get("job_id")]
        if batch_week is None:
            ids.extend(self.get_dismissed_job_card_ids(user_id))
        return list(dict.fromkeys(ids))

    def get_user_match_stack(
        self, user_id: str, *, dismissed: set[str] | None = None
    ) -> list[dict[str, Any]]:
        """Return the user's durable match stack, newest refresh rows first.

        Matches are permanent per-(user,job) evals (Backlog #36 de-weekly;
        migration 20260710) — one row per job, upserted in place on re-eval, not
        a per-week snapshot. Read every retained row, sort newest-first, keep the
        latest per job. (The de-dupe here is belt-and-suspenders now the unique
        index is (user_id, job_id); it also absorbs any legacy multi-week rows
        that predate the migration.)

        ``dismissed`` lets a caller that ALREADY holds the dismissed-card set
        pass it in instead of paying a second round trip for it here. Omitted,
        this reads it itself — every existing caller keeps its current
        behaviour. `/jobs/matches` passes it because it needs the same set for
        its own response field, and was reading it twice
        (ARCHITECTURE_READ_PATH.md S4-followup).
        """
        result = (
            self._db.table("user_job_matches")
            .select(
                "id, job_id, overlap_score, llm_rank, llm_explanation, "
                "batch_week, computed_at, matched_skills, "
                "is_recommended, baseline_version_id, target_context_hash, seniority_compatibility, "
                "overall_score, grade, recommendation, application_angle, summary, "
                "role_fit, comp_fit, growth_fit, culture_fit, risk_score, strengths, concerns, "
                "archetype, legitimacy_tier, legitimacy_reason, "
                "level_strategy, personalization, star_pointers, "
                "jobs(job_title, company_name, industry, location, location_raw, location_city, "
                "location_country, location_mode, location_quality, locations, apply_url, "
                "job_summary, job_description, "
                "date_posted, seniority_level, work_mode, min_years_experience, max_years_experience, "
                "first_seen, last_seen, is_active, listing_confidence, last_verified_live_at)"
            )
            .eq("user_id", user_id)
            .execute()
        )
        if dismissed is None:
            dismissed = set(self.get_dismissed_job_card_ids(user_id))
        rows = list(result.data or [])
        rows.sort(key=_match_stack_sort_key, reverse=True)

        stack: list[dict[str, Any]] = []
        seen: set[str] = set()
        for row in rows:
            job_id = str(row.get("job_id") or "")
            if not job_id or job_id in seen or job_id in dismissed:
                continue
            seen.add(job_id)
            job = row.get("jobs") or {}
            if not is_recommendable_listing(job):
                continue
            _hydrate_location_fields(job)
            stack.append(row)
        return stack

    # Feed badge subset vs the full drawer eval — one method, two column sets.
    _MATCH_EVAL_BADGE_COLS = (
        "job_id, batch_week, computed_at, llm_rank, overlap_score, "
        "overall_score, grade, recommendation, "
        "archetype, legitimacy_tier, legitimacy_reason, seniority_compatibility"
    )
    _MATCH_EVAL_FULL_COLS = (
        _MATCH_EVAL_BADGE_COLS
        + ", summary, application_angle, role_fit, comp_fit, growth_fit, "
        "culture_fit, risk_score, strengths, concerns, "
        "level_strategy, personalization, star_pointers"
    )

    def get_cached_match_evals(
        self, user_id: str, job_ids: list[str], *, full: bool = False
    ) -> dict[str, dict[str, Any]]:
        """Newest cached brain eval per job for this user (Consolidation D).

        The feed/search read side JOINs this so a card shows the grade / verdict /
        legitimacy the Matching Brain already produced on a prior refresh — no LLM
        call at read time. Default returns the light badge subset (cheap for a whole
        feed page); ``full=True`` adds the summary / 5-axis / strengths columns the
        drawer needs for one job. A job with no cached row is absent from the map.
        """
        clean = [str(j) for j in job_ids if j]
        if not clean:
            return {}
        result = (
            self._db.table("user_job_matches")
            .select(self._MATCH_EVAL_FULL_COLS if full else self._MATCH_EVAL_BADGE_COLS)
            .eq("user_id", user_id)
            .in_("job_id", clean)
            .execute()
        )
        rows = list(result.data or [])
        rows.sort(key=_match_stack_sort_key, reverse=True)  # newest refresh first
        evals: dict[str, dict[str, Any]] = {}
        for row in rows:
            jid = str(row.get("job_id") or "")
            if jid and jid not in evals:
                evals[jid] = row
        return evals

    def upsert_single_match_eval(self, user_id: str, row: dict[str, Any]) -> None:
        """Admin upsert of ONE on-demand match row (Consolidation D rank_one).

        Uses the admin client so a token-scoped read repo can still persist the
        brain result (RLS on user_job_matches is owner-select; writes are service
        paths). Same conflict key as the batch persister — one row per user/job,
        permanent (Backlog #36 de-weekly; migration 20260710)."""
        self._admin_db.table("user_job_matches").upsert(
            row, on_conflict="user_id,job_id"
        ).execute()

    def dismiss_dashboard_job_card(self, user_id: str, job_id: str) -> None:
        self._db.table("user_dismissed_job_cards").upsert(
            {"user_id": user_id, "job_id": job_id},
            on_conflict="user_id,job_id",
        ).execute()

    def undismiss_job_card(self, user_id: str, job_id: str) -> None:
        """Undo a dismissal (market-feed Skip 'Undo'). Reuses the canonical
        rejection table — one rejection signal across feed + dashboard."""
        (
            self._db.table("user_dismissed_job_cards")
            .delete()
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .execute()
        )

    def clear_recommendations(self, user_id: str) -> None:
        """Remove promotion status before a new CV/target context is ranked."""
        (
            self._db.table("user_job_matches")
            .update({"is_recommended": False})
            .eq("user_id", user_id)
            .eq("is_recommended", True)
            .execute()
        )

    def get_saved_job_ids(self, user_id: str) -> list[str]:
        """job_ids the user has saved (any application row exists). Feed excludes
        these so the draining queue only shows undecided roles (S3: every saved
        job is an intended application)."""
        result = (
            self._db.table("job_applications")
            .select("job_id")
            .eq("user_id", user_id)
            .execute()
        )
        return [str(r["job_id"]) for r in (result.data or []) if r.get("job_id")]

    def get_followed_company_names(self, user_id: str) -> set[str]:
        """Company names the user follows (RLS-scoped). Powers the feed's
        'Following only' filter without crossing into the users repository."""
        result = (
            self._db.table("followed_companies")
            .select("company_name")
            .eq("user_id", user_id)
            .execute()
        )
        return {
            (r.get("company_name") or "").strip()
            for r in (result.data or [])
            if (r.get("company_name") or "").strip()
        }

    def get_user_matches_for_week(
        self, user_id: str, batch_week: date
    ) -> list[dict[str, Any]]:
        result = (
            self._db.table("user_job_matches")
            .select(
                "id, job_id, overlap_score, llm_rank, llm_explanation, "
                "batch_week, computed_at, matched_skills, "
                "is_recommended, baseline_version_id, target_context_hash, seniority_compatibility, "
                "overall_score, grade, recommendation, application_angle, summary, "
                "role_fit, comp_fit, growth_fit, culture_fit, risk_score, strengths, concerns, "
                "archetype, legitimacy_tier, legitimacy_reason, "
                "level_strategy, personalization, star_pointers, "
                "jobs(job_title, company_name, industry, location, location_raw, location_city, "
                "location_country, location_mode, location_quality, locations, apply_url, job_description)"
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

    def get_matches_for_context(
        self,
        user_id: str,
        baseline_version_id: int,
        context_hash: str,
        *,
        limit: int = 3,
    ) -> list[dict[str, Any]]:
        """Matches computed for ONE exact direction, best-ranked first.

        `get_user_match_stack` is deliberately context-blind — the dashboard
        wants every job Myro has ever matched this user to. The onboarding
        shortlist asks a different question: which roles came out of the
        direction they just chose. Serving the first answer to the second
        question is what put cards from a previous direction on screen while
        `commit_first_role` — which has always checked (baseline, context) —
        rejected them with "Choose a role from your current shortlist."

        One function now answers both the read and the write, so the shortlist
        a user is shown is by construction the shortlist they can save.
        """
        rows = (
            self._db.table("user_job_matches")
            .select(
                "id, job_id, overlap_score, llm_rank, llm_explanation, "
                "batch_week, computed_at, matched_skills, "
                "is_recommended, baseline_version_id, target_context_hash, seniority_compatibility, "
                "overall_score, grade, recommendation, application_angle, summary, "
                "role_fit, comp_fit, growth_fit, culture_fit, risk_score, strengths, concerns, "
                "archetype, legitimacy_tier, legitimacy_reason, "
                "level_strategy, personalization, star_pointers, "
                "jobs(job_title, company_name, industry, location, location_raw, location_city, "
                "location_country, location_mode, location_quality, locations, apply_url, "
                "job_summary, job_description, "
                "date_posted, seniority_level, work_mode, min_years_experience, max_years_experience, "
                "first_seen, last_seen, is_active, listing_confidence, last_verified_live_at)"
            )
            .eq("user_id", user_id)
            .eq("baseline_version_id", baseline_version_id)
            .eq("target_context_hash", context_hash)
            .order("llm_rank")
            .execute()
        ).data or []

        dismissed = set(self.get_dismissed_job_card_ids(user_id))
        out: list[dict[str, Any]] = []
        seen: set[str] = set()
        for row in rows:
            job_id = str(row.get("job_id") or "")
            if not job_id or job_id in seen or job_id in dismissed:
                continue
            job = row.get("jobs") or {}
            # Same recommendability gate as the durable stack — a delisted or
            # junk listing must not become someone's first saved role.
            if not is_recommendable_listing(job):
                continue
            seen.add(job_id)
            _hydrate_location_fields(job)
            out.append(row)
            if len(out) >= limit:
                break
        return out

    def get_current_credible_match(
        self,
        user_id: str,
        baseline_version_id: int,
        context_hash: str,
    ) -> dict[str, Any] | None:
        result = (
            self._db.table("user_job_matches")
            .select(
                "id, job_id, overall_score, grade, recommendation, summary, "
                "overlap_score, llm_rank, matched_skills, "
                "jobs(job_title, company_name, location, location_city, "
                "location_country, location_mode, apply_url)"
            )
            .eq("user_id", user_id)
            .eq("baseline_version_id", baseline_version_id)
            .eq("target_context_hash", context_hash)
            .eq("is_recommended", True)
            .order("llm_rank")
            .execute()
        )
        dismissed = set(self.get_dismissed_job_card_ids(user_id))
        for row in result.data or []:
            if str(row.get("job_id")) not in dismissed:
                return row
        return None

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
            on_conflict="user_id,job_id",
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
        # user_profiles PK is `id`, not `user_id` — filtering on user_id raises
        # 42703 "column user_profiles.user_id does not exist" and 500s /deepenings.
        rows = safe_read(
            self._db.table("user_profiles")
            .select("deepening_sampled")
            .eq("id", user_id)
            .limit(1),
            default=[],
            context="deepening_sampled",
        )
        return bool(rows and rows[0].get("deepening_sampled"))

    def set_deepening_sampled(self, user_id: str) -> None:
        self._admin_db.table("user_profiles").update(
            {"deepening_sampled": True}
        ).eq("id", user_id).execute()

    def get_user_skill_rows(self, user_id: str) -> list[dict[str, Any]]:
        result = (
            self._db.table("user_skills")
            .select("matched_level, skills(taxonomy_key)")
            .eq("user_id", user_id)
            .execute()
        )
        return result.data or []

    def get_user_profile_targeting(self, user_id: str) -> dict[str, Any]:
        # On the paid Refresh hot path: a missing profile row (or the postgrest-py
        # 204 quirk) must degrade to empty targeting, never crash the pipeline and
        # trigger a refund. safe_read absorbs the benign "no row" case.
        data = safe_read(
            self._db.table("user_profiles")
            .select(
                "target_roles, target_location, target_location_country, "
                "target_locations, target_location_countries, "
                "target_role_title, target_role_titles, target_seniority, "
                "target_career_band, explored_career_bands, "
                "deal_breakers, career_goal, superpower"
            )
            .eq("id", user_id)
            .maybe_single(),
            default=None,
            context="user_profile_targeting",
        )
        profile = data or {}
        profile["cv_markdown"] = self.get_user_cv_markdown(user_id)
        return profile

    def get_latest_baseline_id(self, user_id: str) -> int | None:
        result = (
            self._db.table("cv_versions")
            .select("id")
            .eq("user_id", user_id)
            .eq("kind", "baseline_upload")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return int(rows[0]["id"]) if rows else None

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
        # NOTE: job_applications carries no FK to jobs (20260711c retirement
        # migration) — attach_jobs joins in Python instead of a PostgREST embed.
        # Pull the card-render columns so a tracked job renders the full FeedCard
        # (chips/location/meta), not just title/company. Mirrors the match-stack join.
        result = (
            self._db.table("job_applications")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        rows = result.data or []
        attach_jobs(
            rows,
            self._db,
            "job_title, company_name, job_description, main_skills, "
            "job_summary, apply_url, location, location_raw, location_city, "
            "location_country, location_mode, location_quality, locations, "
            "date_posted, seniority_level, work_mode, role_domain, "
            "min_years_experience, max_years_experience",
        )
        for row in rows:
            if row.get("jobs"):
                _hydrate_location_fields(row["jobs"])
        return rows

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
        # NOTE: job_applications carries no FK to jobs (20260711c retirement
        # migration) — attach_jobs joins in Python instead of a PostgREST embed.
        row = safe_read(
            self._db.table("job_applications")
            .select("*")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .maybe_single(),
            default=None,
            context="application_with_job",
        )
        if not row:
            return None
        attach_jobs([row], self._db, "job_title, company_name, job_description")
        return row

    def dismiss_saved_job(self, user_id: str, job_id: str) -> bool:
        """Remove saved intent + record Not Interested in one RLS-scoped RPC.

        The database function derives ownership from ``auth.uid()``. ``user_id``
        remains in this repository interface so callers cannot accidentally lose
        the principal boundary, but it is deliberately never sent to PostgREST.
        """
        _ = user_id
        try:
            self._db.rpc("dismiss_saved_job", {"p_job_id": job_id}).execute()
        except APIError as exc:
            if exc.code == "P0002":
                return False
            raise
        return True

    def restore_saved_job(self, user_id: str, job_id: str) -> bool:
        """Undo a saved-job dismissal through the caller's RLS-scoped client."""
        _ = user_id
        try:
            self._db.rpc("restore_saved_job", {"p_job_id": job_id}).execute()
        except APIError as exc:
            if exc.code == "P0002":
                return False
            raise
        return True

    def record_apply_intent(
        self,
        user_id: str,
        job_id: str,
        intent: dict[str, str],
    ) -> None:
        """Persist an outbound attempt without claiming the user submitted."""
        _ = user_id
        self._db.rpc(
            "record_job_apply_intent",
            {
                "p_job_id": job_id,
                "p_client_event_id": intent["client_event_id"],
                "p_surface": intent["surface"],
                "p_destination_type": intent["destination_type"],
            },
        ).execute()

    def get_stale_applications(self, user_id: str) -> list[dict[str, Any]]:
        # Q7: filter on dedicated last_stage_changed_at column so notes/followed_up
        # edits don't mask company silence. Dismiss also bumps this column → 7-day snooze.
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        stages = ["saved", "applied", "interviewing"]
        result = (
            self._db.table("job_applications")
            .select("id, job_id, status, last_stage_changed_at, updated_at")
            .eq("user_id", user_id)
            .in_("status", stages)
            .lt("last_stage_changed_at", cutoff)
            .order("last_stage_changed_at", desc=False)
            .execute()
        )
        rows = result.data or []
        attach_jobs(rows, self._db, "job_title, company_name")
        return rows

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
        # user_profiles PK is `id`, not `user_id` (see get_deepening_sampled).
        existing = safe_read(
            self._db.table("user_profiles")
            .select("first_offer_at")
            .eq("id", user_id)
            .maybe_single(),
            default=None,
            context="first_offer_at",
        )
        if existing and existing.get("first_offer_at"):
            return False
        self._db.table("user_profiles").update(
            {"first_offer_at": timestamp_iso}
        ).eq("id", user_id).execute()
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
        meta = safe_read(
            self._db.table("jobs")
            .select("job_id, job_title, company_name, main_skills, side_skills")
            .eq("job_id", job_id)
            .maybe_single(),
            default=None,
            context="job_skills_meta",
        )
        if not meta:
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

        # Extension-added jobs never get canonical job_skills rows (the scraper
        # pipeline writes those). Fall back to the taxonomy-validated main/side
        # skills the extension stored, so the Tailor match isn't a phantom 0%.
        if not skills:
            skills = self._synth_skills_from_text(meta)

        return {**meta, "skills": skills}

    @staticmethod
    def _synth_skills_from_text(meta: dict[str, Any]) -> list[dict[str, Any]]:
        """Build skill-gap entries from a job's `main_skills`/`side_skills` text
        arrays (already taxonomy keys, per the importer). Mirrors the default
        required-levels used for canonical rows (primary 4, secondary 2)."""
        out: list[dict[str, Any]] = []
        seen: set[str] = set()
        for is_primary, col in ((True, "main_skills"), (False, "side_skills")):
            for raw in meta.get(col) or []:
                key = (raw or "").strip()
                if not key or key.lower() in seen:
                    continue
                seen.add(key.lower())
                out.append({
                    "taxonomy_key": key,
                    "is_primary": is_primary,
                    "required_level": 4 if is_primary else 2,
                })
        return out

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

    def get_gap_skill_context(
        self, user_id: str, taxonomy_keys: list[str]
    ) -> dict[str, dict[str, Any]]:
        """For the gap-plan session: resolve each job-skill key → its display name
        and the user's PRACTICE-proven level (skill_assessed_level), which the
        planner uses for the flywheel upgrade offer. Keyed by taxonomy_key.

        Job skills include ones the user has never had on their CV, so we resolve
        names off the global `skills` table, not `user_skills`.
        """
        keys = [k for k in {k.strip() for k in taxonomy_keys} if k]
        if not keys:
            return {}

        skill_rows = (
            self._db.table("skills")
            .select("id, taxonomy_key, display_name")
            .in_("taxonomy_key", keys)
            .execute()
        ).data or []

        id_to_key: dict[int, str] = {}
        context: dict[str, dict[str, Any]] = {}
        for row in skill_rows:
            key = (row.get("taxonomy_key") or "").strip()
            sid = row.get("id")
            if not key or sid is None:
                continue
            id_to_key[int(sid)] = key
            context[key] = {
                "display_name": (row.get("display_name") or key).strip() or key,
                "assessed_level": 0,
            }

        if id_to_key:
            assessed_rows = (
                self._db.table("skill_assessed_level")
                .select("skill_id, assessed_level")
                .eq("user_id", user_id)
                .in_("skill_id", list(id_to_key.keys()))
                .execute()
            ).data or []
            for row in assessed_rows:
                key = id_to_key.get(int(row["skill_id"]))
                if key:
                    context[key]["assessed_level"] = int(row.get("assessed_level") or 0)

        return context

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
        """All jobs for a company, paginated, with primary skills per job.

        Pagination lives at the DB seam: ``.order().range()`` returns only the
        requested window and ``count="exact"`` returns the company total in the
        same round-trip (the feed idiom). A big company (Accenture ~2.7k rows)
        costs one 50-row fetch, not a full-table pull sorted+sliced in Python —
        the last read-path latency residual of backlog #21.
        """
        start = max(0, (page - 1)) * page_size
        end = start + page_size - 1
        result = (
            self._db.table("jobs")
            .select(
                "job_id, job_title, location, location_raw, "
                "location_city, location_country, location_mode, location_quality",
                count="exact",
            )
            .ilike("company_name", company_name)
            .eq("is_active", True)
            .eq("listing_confidence", "active")
            .order("job_id")
            .range(start, end)
            .execute()
        )
        page_rows = [r for r in (result.data or []) if r.get("job_id")]
        total = result.count if result.count is not None else len(page_rows)
        for row in page_rows:
            _hydrate_location_fields(row)

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
