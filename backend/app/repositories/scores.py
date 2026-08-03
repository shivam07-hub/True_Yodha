from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, TypeVar

from fastapi import Depends
from postgrest.exceptions import APIError
from supabase import Client

from app.database import get_supabase_admin
from app.deps import get_user_db
from app.repositories.job_skills_read_model import fetch_all_rows, fetch_job_skill_rows, group_job_skill_rows

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Transient upstream errors (Cloudflare 1101 / PostgREST 5xx) → retry. Bug-class
# errors (4xx, query shape, auth) → never retry. Classification keeps blind
# retry from masking real logic errors.
_RETRYABLE_HTTP_PREFIXES = ("5", "PGRST5")

# Budget for one `in.(…)` filter, in bytes of key text.
#
# Deliberately a BYTE budget and not a key count: what broke was URL length, and
# taxonomy keys vary from "SQL" to "Certified Information Systems Security
# Professional (CISSP)". A flat count of 200 is ~4 KB of short keys but ~10 KB of
# long ones — still over the limit for exactly the vocabulary that overflows first.
# 6 KB leaves headroom under the smallest URI limit in the path (~8 KB at the edge)
# for the base URL, the select list and percent-encoding.
_KEY_FILTER_BYTE_BUDGET = 6_000


def _key_chunks(keys: list[str]) -> list[list[str]]:
    """Split keys into `in.(…)`-sized groups by byte cost, never by count.

    Cost per key is its length plus 3 — the comma and the pair of quotes PostgREST
    adds around any value containing a space, comma or paren, which is most of the
    taxonomy. A single key over budget still ships alone; dropping it would be a
    silent hole in the demand map.
    """
    chunks: list[list[str]] = []
    current: list[str] = []
    used = 0
    for key in keys:
        cost = len(key) + 3
        if current and used + cost > _KEY_FILTER_BYTE_BUDGET:
            chunks.append(current)
            current, used = [], 0
        current.append(key)
        used += cost
    if current:
        chunks.append(current)
    return chunks


def _is_transient(exc: BaseException) -> bool:
    """True iff the exception looks like a transient upstream blip worth retrying.

    Covers:
      - postgrest.exceptions.APIError with 5xx http code OR PGRST5xx code
      - generic network errors that don't expose status (ConnectionError, TimeoutError)
    Excludes:
      - APIError with 4xx (auth, query shape, RLS)
      - any other Exception subclass — real bugs should not be retried
    """
    if isinstance(exc, APIError):
        code = str(getattr(exc, "code", "") or "")
        return any(code.startswith(prefix) for prefix in _RETRYABLE_HTTP_PREFIXES)
    return isinstance(exc, (ConnectionError, TimeoutError))


def _retry_supabase(fn: Callable[[], T], *, attempts: int = 3, base_delay: float = 0.25) -> T:
    """Exponential backoff retry around a Supabase read, classified by `_is_transient`.

    Default: 3 attempts → 250ms + 500ms backoffs (worst case ~750ms latency cost).
    Single-source-of-truth for transient-blip handling on PostgREST reads. Callers
    stay dumb (Ousterhout deep-module: retry is part of the repo's contract).
    """
    last_exc: BaseException | None = None
    for attempt in range(attempts):
        try:
            return fn()
        except BaseException as exc:
            last_exc = exc
            if not _is_transient(exc) or attempt == attempts - 1:
                raise
            delay = base_delay * (2 ** attempt)
            logger.warning(
                "metric supabase.retry attempt=%d/%d delay_ms=%d exc=%s",
                attempt + 1, attempts, int(delay * 1000), exc.__class__.__name__,
            )
            time.sleep(delay)
    assert last_exc is not None
    raise last_exc


@dataclass(frozen=True)
class ScoreRecomputeInputs:
    skill_level_map: dict[str, int]
    target_roles: list[str]
    target_seniority: str = ""


@dataclass(frozen=True)
class RoleFamilyMarket:
    """What the user's chosen families demand — target level AND ranking weight.

    Both halves come from one pass over one job set, so a gap can never be
    targeted by one market and weighted by another (which is what happened while
    the target came from the family scope and the weight came from the whole
    corpus). Empty on either an unset target or a read failure; callers treat
    empty as "no role-backed market" and say so in the copy.
    """

    aspiration: dict[str, int]
    demand: dict[str, int]

    @property
    def is_empty(self) -> bool:
        return not self.aspiration and not self.demand

    @classmethod
    def empty(cls) -> "RoleFamilyMarket":
        return cls(aspiration={}, demand={})


class ScoresRepository:
    def __init__(self, db: Client):
        self._db = db

    @property
    def client(self) -> Client:
        return self._db

    def get_mirror_score(self, user_id: str) -> dict[str, Any] | None:
        result = (
            self._db.table("mirror_scores")
            .select("*")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if result is None:
            return None
        return result.data or None

    def get_user_skill_for_key(self, user_id: str, taxonomy_key: str) -> dict[str, Any] | None:
        """Single user_skills row + joined display_name for one taxonomy_key.

        Used by the skill-edit router to recover `evidence_text` before the
        bullet locator runs. Returns None when the user does not hold the skill.
        """
        result = (
            self._db.table("user_skills")
            .select("evidence_text, skills(taxonomy_key, display_name)")
            .eq("user_id", user_id)
            .execute()
        )
        for row in result.data or []:
            skill = row.get("skills") or {}
            if skill.get("taxonomy_key") == taxonomy_key:
                return {
                    "evidence_text": row.get("evidence_text"),
                    "display_name":  skill.get("display_name"),
                    "taxonomy_key":  taxonomy_key,
                }
        return None

    def get_skill_id_for_key(self, taxonomy_key: str) -> int | None:
        """skills.id for one taxonomy_key, or None when it is not in the catalog."""
        result = (
            self._db.table("skills")
            .select("id")
            .eq("taxonomy_key", taxonomy_key)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return int(rows[0]["id"]) if rows else None

    def get_user_skill_row(self, user_id: str, skill_id: int) -> dict[str, Any] | None:
        """One raw user_skills row, including the forge counters.

        Skill correction has to read the counters before it removes a row, so a
        user who takes a skill off their CV and later puts it back does not
        silently lose their practice history.
        """
        result = (
            self._db.table("user_skills")
            .select("matched_level, proficiency_title, source, evidence_text, "
                    "forge_sessions_count, total_forge_minutes")
            .eq("user_id", user_id)
            .eq("skill_id", skill_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def delete_user_skill(self, user_id: str, skill_id: int) -> None:
        self._db.table("user_skills").delete().eq("user_id", user_id).eq(
            "skill_id", skill_id
        ).execute()

    def get_display_names_for_keys(self, taxonomy_keys: list[str]) -> dict[str, str]:
        """{taxonomy_key: display_name} for keys already in the catalog.

        One batched read, so a candidate list can be labelled without a
        per-skill round trip. Keys absent from the catalog are simply missing
        from the result — callers fall back to the key, which is also what
        ``ensure_skill_in_db`` would store for them on publish.
        """
        if not taxonomy_keys:
            return {}
        result = (
            self._db.table("skills")
            .select("taxonomy_key, display_name")
            .in_("taxonomy_key", taxonomy_keys)
            .execute()
        )
        return {
            row["taxonomy_key"]: row.get("display_name") or row["taxonomy_key"]
            for row in result.data or []
        }

    def get_user_skill_level_map(self, user_id: str) -> dict[str, int]:
        result = (
            self._db.table("user_skills")
            .select("matched_level, evidence_text, skills(taxonomy_key)")
            .eq("user_id", user_id)
            .execute()
        )
        return {
            row["skills"]["taxonomy_key"]: int(row["matched_level"])
            for row in result.data or []
            if row.get("skills") and row["skills"].get("taxonomy_key")
        }

    def get_target_roles(self, user_id: str) -> list[str]:
        result = (
            self._db.table("user_profiles")
            .select("target_roles")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        roles = ((result.data if result else {}) or {}).get("target_roles") or []
        return [str(role).strip() for role in roles if str(role).strip()]

    def get_target_seniority(self, user_id: str) -> str:
        """Raw target_seniority string for band-relative scoring ('' when unset).

        Normalization (aliases, 'any'/null → entry) happens in the scoring
        orchestrator via job_eligibility.target_seniority_for_profile.
        """
        result = (
            self._db.table("user_profiles")
            .select("target_seniority")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        value = ((result.data if result else {}) or {}).get("target_seniority")
        return str(value).strip() if value else ""

    def get_recompute_inputs(self, user_id: str) -> ScoreRecomputeInputs:
        return ScoreRecomputeInputs(
            skill_level_map=self.get_user_skill_level_map(user_id),
            target_roles=self.get_target_roles(user_id),
            target_seniority=self.get_target_seniority(user_id),
        )

    def find_role_skill_rows(self, role: str) -> list[dict[str, Any]]:
        """Job-skill rows for jobs whose title matches `role`.

        Wrapped in `_retry_supabase` because the upstream PostgREST worker on
        gipvxuugajkugntwkeiz.supabase.co occasionally throws Cloudflare 1101
        ('Worker threw exception') on this ILIKE path even though the actual
        query is fast (27k jobs, ~111 hits on '%Communication%'). Transient.
        A single retry rescues it. See aspirations.py for the caller-side
        observability + market-demand fallback.
        """
        pattern = f"%{role}%"
        jobs = _retry_supabase(lambda: (
            self._db.table("jobs")
            .select("job_id")
            .ilike("job_title", pattern)
            .limit(100)
            .execute()
        ).data or [])
        if not jobs:
            return []
        job_ids = [j["job_id"] for j in jobs]
        rows = _retry_supabase(lambda: (
            self._db.table("job_skills")
            .select("job_id, is_primary, skills(taxonomy_key)")
            .in_("job_id", job_ids)
            .execute()
        ).data or [])
        return group_job_skill_rows(rows)

    def get_role_family_market(self, families: list[str]) -> RoleFamilyMarket:
        """Target proficiency AND weighted demand for the user's chosen families.

        One RPC over one job set — the same family scope Career Ops selects on —
        so the level a gap is measured against and the weight it is ranked by can
        never come from two different markets.

        The scope travels as the family array, never as the answer keys. The
        previous shape asked for demand by sending every taxonomy key back as a
        `in.(…)` filter; two families expand to 1,642 keys / 33.5 KB, which
        exceeded the edge's URI limit and returned a non-JSON `Bad Request` —
        caught, fail-soft, and therefore invisible while every gap silently
        weighed 0. A short array of family names cannot grow that way.
        """
        if not families:
            return RoleFamilyMarket.empty()
        rows = self._db.rpc(
            "role_family_market_skills", {"p_families": families}
        ).execute().data or []
        aspiration: dict[str, int] = {}
        demand: dict[str, int] = {}
        for row in rows:
            key = str(row.get("taxonomy_key") or "").strip()
            total = int(row.get("job_count") or 0)
            primary_count = int(row.get("primary_job_count") or 0)
            if not key or not total:
                continue
            demand[key] = int(row.get("weighted_demand") or 0)
            if primary_count:
                aspiration[key] = 4 if primary_count / total > 0.5 else 3
            elif row.get("has_side_skill"):
                aspiration[key] = 2
        return RoleFamilyMarket(aspiration=aspiration, demand=demand)

    def list_market_skill_rows(self) -> list[dict[str, Any]]:
        """Returns job skills from the FK-enforced job_skills join table."""
        return group_job_skill_rows(fetch_job_skill_rows(self._db))

    def get_skill_demand_for_keys(self, taxonomy_keys: set[str]) -> dict[str, int]:
        """Weighted market demand, corpus-wide, for a bounded set of taxonomy keys.

        The pre-target path: a user who has confirmed skills but not yet chosen a
        direction has no family scope to measure against, so demand here is the
        open market. Once a direction exists, `get_role_family_market` supersedes
        this — same weighting, scoped to the families the user picked.

        Keys travel in the URL, so the request size grows with the key count. That
        is why this is chunked and not simply handed the whole set: a caller that
        passed a family's worth of keys (1,642 of them, 33.5 KB) produced a URL
        past the edge's limit and got back a non-JSON `Bad Request`, which the
        caller swallowed — every gap then weighed 0 with nothing on fire. Chunking
        makes the request size a function of the chunk, never of the input.
        """
        wanted = {key.strip() for key in taxonomy_keys if key and key.strip()}
        if not wanted:
            return {}

        chunks = _key_chunks(sorted(wanted))
        if len(chunks) > 1:
            logger.info(
                "metric scoring.demand_key_lookup_chunked keys=%d chunks=%d",
                len(wanted), len(chunks),
            )
        skill_rows: list[dict[str, Any]] = []
        for chunk in chunks:
            skill_rows.extend(_retry_supabase(lambda _chunk=chunk: (
                self._db.table("skills")
                .select("id, taxonomy_key")
                .in_("taxonomy_key", _chunk)
                .execute()
            ).data or []))

        id_to_key: dict[int, str] = {}
        for row in skill_rows:
            try:
                skill_id = int(row.get("id"))
            except (TypeError, ValueError):
                continue
            key = (row.get("taxonomy_key") or "").strip()
            if key:
                id_to_key[skill_id] = key
        if not id_to_key:
            return {}

        skill_ids = sorted(id_to_key)
        try:
            rows = self._db.rpc(
                "count_job_demand_for_skills", {"p_skill_ids": skill_ids}
            ).execute().data or []
        except APIError as exc:
            logger.warning(
                "metric scoring.demand_rpc_fallback skills=%d exc=%s",
                len(skill_ids), exc.__class__.__name__,
            )
            rows = fetch_all_rows(
                self._db,
                table="job_skills",
                columns="skill_id, is_primary",
                query_builder=lambda q, _ids=skill_ids: q.in_("skill_id", _ids),
            )
            weighted = {skill_id: 0 for skill_id in skill_ids}
            for row in rows:
                try:
                    skill_id = int(row.get("skill_id"))
                except (TypeError, ValueError):
                    continue
                if skill_id in weighted:
                    weighted[skill_id] += 2 if row.get("is_primary") else 1
            return {id_to_key[skill_id]: demand for skill_id, demand in weighted.items()}

        demand: dict[str, int] = {}
        for row in rows:
            try:
                skill_id = int(row.get("skill_id"))
                weighted = int(row.get("weighted_demand") or 0)
            except (TypeError, ValueError):
                continue
            key = id_to_key.get(skill_id)
            if key:
                demand[key] = weighted
        return demand

    def upsert_user_skill_rows(self, rows: list[dict[str, Any]]) -> None:
        if rows:
            self._db.table("user_skills").upsert(rows, on_conflict="user_id,skill_id").execute()

    def mirror_score_exists(self, user_id: str) -> bool:
        result = (
            self._db.table("mirror_scores")
            .select("user_id")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return bool(result and result.data)

    def update_mirror_score(self, user_id: str, payload: dict[str, Any]) -> None:
        self._db.table("mirror_scores").update(payload).eq("user_id", user_id).execute()

    def insert_mirror_score(self, user_id: str, payload: dict[str, Any]) -> None:
        self._db.table("mirror_scores").insert({"user_id": user_id, **payload}).execute()

    def update_percentile(self, user_id: str, percentile: float) -> None:
        self._db.table("mirror_scores").update({"percentile": percentile}).eq(
            "user_id", user_id
        ).execute()

    def get_all_band_scores(self) -> list[tuple[str, float]]:
        """(raw target_seniority, total_score) for every scored user.

        Feeds band-relative percentile: the caller resolves each raw seniority
        to its band and ranks the subject against same-band peers. Two small
        reads joined in Python — the scored population is well under 10k, so a
        band-filtered SQL join isn't worth the derived-band complexity yet.
        """
        scores = (
            self._db.table("mirror_scores").select("user_id, total_score").execute().data or []
        )
        profiles = (
            self._db.table("user_profiles").select("id, target_seniority").execute().data or []
        )
        seniority_by_id = {p["id"]: p.get("target_seniority") for p in profiles if p.get("id")}
        out: list[tuple[str, float]] = []
        for row in scores:
            uid = row.get("user_id")
            total = row.get("total_score")
            if uid is None or total is None:
                continue
            out.append((str(seniority_by_id.get(uid) or ""), float(total)))
        return out

    def append_score_history(self, user_id: str, total_score: float) -> None:
        self._db.table("mirror_score_history").insert(
            {
                "user_id": user_id,
                "total_score": total_score,
            }
        ).execute()

    def require_mirror_score(self, user_id: str) -> dict[str, Any]:
        result = self._db.table("mirror_scores").select("*").eq("user_id", user_id).single().execute()
        return result.data


def get_token_scores_repository(db: Client = Depends(get_user_db)) -> ScoresRepository:
    # NOTE: find_role_skill_rows / list_market_skill_rows read public.jobs.
    # Requires RLS to allow `authenticated` reads on jobs. Verify before deploying.
    return ScoresRepository(db)


def get_scores_repository(db: Client = Depends(get_supabase_admin)) -> ScoresRepository:
    """Admin factory — internal/ops use only (e.g. backfill scripts). Not for user routes."""
    return ScoresRepository(db)
