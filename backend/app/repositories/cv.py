"""CV Versions repository — single writer seam for the unified cv_versions table.

See CONTEXT.md for the domain vocabulary (CV Version, CV Lineage, Writer Seam).

Every endpoint that creates a CV Version (upload, save playground, polish, edit)
reduces to building a CVVersionWriteSpec and calling .create(spec). This is the
only place that writes to cv_versions.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from fastapi import Depends, HTTPException, status
from supabase import Client

from app.deps import get_user_db
from app.services.job_history import attach_jobs


CVKind = Literal["baseline_upload", "deterministic", "polished", "edited"]


@dataclass
class CVVersionWriteSpec:
    """The single shape through which a CV Version enters the database.

    Invariants enforced by CVVersionsRepository.create:
      - kind ↔ job_id consistency (baseline_upload xor job_id IS NULL)
      - parent ownership (parent.user_id == user_id)
      - baseline-required-on-derivative (every non-baseline write has a baseline)
      - parent_version_id is required on non-baseline writes
    """
    kind:               CVKind
    job_id:             str | None
    parent_version_id:  int | None
    body_text:          str
    cv_structured:      dict[str, Any] = field(default_factory=dict)
    skills_detected:    list[dict[str, Any]] = field(default_factory=list)
    polished_text:      str | None = None
    hidden_items:       list[str] = field(default_factory=list)
    edited_items:       dict[str, str] = field(default_factory=dict)
    title:              str | None = None
    snapshot_hash:      str | None = None
    confidence_label:   str | None = None
    proof_count:        int = 0
    ai_polished:        bool = False
    ai_polish_used_at:  str | None = None
    footer_mark_hidden: bool = True


class CVVersionsRepository:
    """Token-scoped repository for cv_versions + adjacent CV-side reads.

    All cv_versions writes go through create(). Reads are split per call site.
    """

    def __init__(self, db: Client) -> None:
        self._db = db

    @property
    def client(self) -> Client:
        return self._db

    # ── user_profiles ─────────────────────────────────────────────────────────
    # cv_raw_text / cv_parsed_at columns dropped in 20260518_cv_versions_unify.
    # Profile-side updates that remain: onboarding_complete + any future fields.

    def update_cv_profile(self, user_id: str, updates: dict[str, Any]) -> None:
        self._db.table("user_profiles").update(updates).eq("id", user_id).execute()

    # ── cv_versions: reads ────────────────────────────────────────────────────

    def list_all(self, user_id: str) -> list[dict[str, Any]]:
        """Every CV Version row for the user (baselines + every derivative).

        Used by surfaces that need the full ledger (no jobId on the CV page).
        Ordered by user_version_number DESC (newest first).
        """
        result = (
            self._db.table("cv_versions")
            .select("*")
            .eq("user_id", user_id)
            .order("user_version_number", desc=True)
            .execute()
        )
        return attach_jobs(result.data or [], self._db, "job_title, company_name")

    def list_thread_for_job(self, user_id: str, job_id: str) -> list[dict[str, Any]]:
        """Baselines + the Company CV Thread for `job_id`'s company.

        Convenience wrapper for surfaces that have a job_id but not a company_name —
        resolves the company first, then delegates to list_thread.
        """
        company_name = self._company_name_for_job(job_id)
        return self.list_thread(user_id, company_name, fallback_job_id=job_id)

    def list_thread(
        self,
        user_id: str,
        company_name: str | None,
        *,
        fallback_job_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Baselines + the Company CV Thread for `company_name`.

        When `company_name` is None (or the company has no jobs the caller can read),
        we fall back to scoping by `fallback_job_id` alone — covers manually-imported
        jobs whose company_name has been stripped or whose `jobs` row isn't visible.

        Ordered by user_version_number DESC (newest first).
        """
        scoped_job_ids = self._thread_job_ids(company_name, fallback_job_id)
        baselines = (
            self._db.table("cv_versions")
            .select("*")
            .eq("user_id", user_id)
            .eq("kind", "baseline_upload")
            .execute()
        ).data or []
        variants = (
            self._db.table("cv_versions")
            .select("*")
            .eq("user_id", user_id)
            .in_("job_id", scoped_job_ids)
            .execute()
        ).data or []
        rows = attach_jobs([*baselines, *variants], self._db, "job_title, company_name")
        return sorted(
            rows,
            key=lambda row: int(row.get("user_version_number") or 0),
            reverse=True,
        )

    def latest_for_thread(
        self,
        user_id: str,
        company_name: str | None,
        *,
        fallback_job_id: str | None = None,
    ) -> dict[str, Any] | None:
        """Canonical CV at a company — highest user_version_number, kind-agnostic.

        Excludes baselines. Returns None if the thread is empty.
        See CONTEXT.md ("Company CV Thread") for the rule.
        """
        scoped_job_ids = self._thread_job_ids(company_name, fallback_job_id)
        if not scoped_job_ids:
            return None
        result = (
            self._db.table("cv_versions")
            .select("*")
            .eq("user_id", user_id)
            .neq("kind", "baseline_upload")
            .in_("job_id", scoped_job_ids)
            .order("user_version_number", desc=True)
            .limit(1)
            .execute()
        )
        row = (result.data or [None])[0]
        if not row:
            return None
        attach_jobs([row], self._db, "job_title, company_name")
        return row

    def latest_for_thread_batch(
        self,
        user_id: str,
        company_names: list[str],
    ) -> dict[str, dict[str, Any]]:
        """Batched variant of latest_for_thread — one query for N companies.

        Used by the tracker to attach a `cv_badge` to each application row without
        an N+1 fetch. Returns a {company_name: row} map; companies with no thread
        are absent from the map.
        """
        unique = sorted({c for c in company_names if c})
        if not unique:
            return {}

        rows = (
            self._db.table("cv_versions")
            .select("*")
            .eq("user_id", user_id)
            .neq("kind", "baseline_upload")
            .order("user_version_number", desc=True)
            .execute()
        ).data or []
        attach_jobs(rows, self._db, "job_title, company_name")

        latest_per_company: dict[str, dict[str, Any]] = {}
        for row in rows:
            company = (row.get("jobs") or {}).get("company_name")
            if company not in unique or company in latest_per_company:
                continue
            latest_per_company[company] = row
        return latest_per_company

    def _company_name_for_job(self, job_id: str) -> str | None:
        target = (
            self._db.table("jobs")
            .select("company_name")
            .eq("job_id", job_id)
            .limit(1)
            .execute()
        )
        return (target.data or [{}])[0].get("company_name")

    def _thread_job_ids(
        self,
        company_name: str | None,
        fallback_job_id: str | None,
    ) -> list[str]:
        """Resolve the list of job_ids that constitute a Company CV Thread.

        Returns all job_ids at `company_name`. Falls back to `[fallback_job_id]`
        when the company is unknown or has no readable jobs — preserves prior
        behaviour for orphan or import-only jobs.
        """
        if company_name:
            company_jobs = (
                self._db.table("jobs")
                .select("job_id")
                .eq("company_name", company_name)
                .execute()
            )
            ids = [
                row["job_id"]
                for row in (company_jobs.data or [])
                if row.get("job_id")
            ]
            if ids:
                return ids
        return [fallback_job_id] if fallback_job_id else []

    def latest_baseline(self, user_id: str) -> dict[str, Any] | None:
        result = (
            self._db.table("cv_versions")
            .select("*")
            .eq("user_id", user_id)
            .eq("kind", "baseline_upload")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    # ── Experience Reservoir (v2) — cv_points ─────────────────────────────────

    def reservoir_points(self, user_id: str) -> list[dict[str, Any]]:
        """All active reservoir points (variants included) for the inventory view.
        RLS scopes to the caller; the user_id filter is defensive."""
        result = (
            self._db.table("cv_points")
            .select("id, point_key, role_anchor, section, text, audience_tags, source, is_canonical, ordering, status")
            .eq("user_id", user_id)
            .eq("status", "active")
            .order("role_anchor")
            .order("ordering")
            .execute()
        )
        return result.data or []

    def append_phrasing(
        self,
        user_id: str,
        role_anchor: str,
        old_text: str,
        new_text: str,
        source: str = "restructure",
    ) -> bool:
        """Dual-write (v2): when a rewrite is accepted onto the master, mirror it into
        the reservoir as a NEW canonical phrasing of the existing point, demoting the
        prior canonical to an alternate (nothing lost — that is the whole reservoir
        idea). Best-effort: no-op when the phrasing is unchanged or the point isn't in
        the reservoir (un-backfilled user → the inventory is live-derived from the
        master, which already holds new_text). Returns True if it appended."""
        new_text = (new_text or "").strip()
        if not new_text or new_text == (old_text or "").strip():
            return False
        found = (
            self._db.table("cv_points")
            .select("id, point_key, section, ordering")
            .eq("user_id", user_id)
            .eq("role_anchor", role_anchor)
            .eq("text", old_text)
            .eq("is_canonical", True)
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        if not found.data:
            return False
        row = found.data[0]
        self._db.table("cv_points").insert({
            "user_id": user_id,
            "point_key": row["point_key"],
            "role_anchor": role_anchor,
            "section": row["section"],
            "text": new_text,
            "source": source,
            "is_canonical": True,
            "ordering": row.get("ordering") or 0,
            "status": "active",
        }).execute()
        self._db.table("cv_points").update({"is_canonical": False}).eq("id", row["id"]).execute()
        return True

    def find(self, version_id: int, user_id: str) -> dict[str, Any] | None:
        """Token-scoped find — RLS also protects, but we filter user_id defensively."""
        result = (
            self._db.table("cv_versions")
            .select("*")
            .eq("id", version_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    def find_by_content_hash(
        self, user_id: str, content_hash: str
    ) -> dict[str, Any] | None:
        """Look up a prior baseline by content hash (used by upload short-circuit)."""
        result = (
            self._db.table("cv_versions")
            .select("id, body_text, cv_structured, skills_detected, skills_confirmed_at")
            .eq("user_id", user_id)
            .eq("kind", "baseline_upload")
            .eq("snapshot_hash", content_hash)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    def next_user_version_number(self, user_id: str) -> int:
        result = (
            self._db.table("cv_versions")
            .select("user_version_number")
            .eq("user_id", user_id)
            .order("user_version_number", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            return 1
        return int(result.data[0].get("user_version_number") or 0) + 1

    def set_footer_mark(
        self, version_id: int, user_id: str, hidden: bool
    ) -> dict[str, Any]:
        """Toggle the Myro footer mark on a single CV Version (certified ⇄ not).

        user_id filter is defensive — RLS also scopes. Raises 404 if the version
        is not the caller's.
        """
        result = (
            self._db.table("cv_versions")
            .update({"footer_mark_hidden": hidden})
            .eq("id", version_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="CV version not found.",
            )
        return result.data[0]

    def update_structured(self, version_id: int, cv_structured: dict[str, Any]) -> None:
        """Lazy backfill — fills cv_structured on a baseline row that was migrated
        from legacy data without one. Repository-level setter, not a general update.
        """
        self._db.table("cv_versions").update(
            {"cv_structured": cv_structured}
        ).eq("id", version_id).execute()

    def confirm_skills(
        self,
        user_id: str,
        baseline_version_id: int,
        skill_rows: list[dict[str, Any]],
        overrides: list[dict[str, Any]],
    ) -> str:
        """Atomically publish one baseline's reviewed skills as user truth."""
        result = self._db.rpc(
            "confirm_cv_skills",
            {
                "p_user_id": user_id,
                "p_baseline_version_id": baseline_version_id,
                "p_skill_rows": skill_rows,
                "p_overrides": overrides,
            },
        ).execute()
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not confirm CV skills.",
            )
        return str(result.data)

    def get_skill_override(
        self, user_id: str, baseline_version_id: int, skill_id: int
    ) -> dict[str, Any] | None:
        result = (
            self._db.table("cv_skill_overrides")
            .select("action, evidence_text, source_location")
            .eq("user_id", user_id)
            .eq("baseline_version_id", baseline_version_id)
            .eq("skill_id", skill_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def upsert_skill_override(
        self,
        user_id: str,
        baseline_version_id: int,
        skill_id: int,
        action: str,
        evidence_text: str,
        source_location: dict[str, Any] | None = None,
    ) -> None:
        """Record one standing skill correction against a baseline.

        Kept as its own row rather than folded into ``confirm_skills`` because a
        correction made months later must not replay the whole publication — that
        path DELETEs and reinserts every cv-sourced skill, which would reset
        forge counters across the board.
        """
        self._db.table("cv_skill_overrides").upsert(
            {
                "user_id": user_id,
                "baseline_version_id": baseline_version_id,
                "skill_id": skill_id,
                "action": action,
                "evidence_text": evidence_text,
                "source_location": source_location or {},
            },
            on_conflict="user_id,baseline_version_id,skill_id",
        ).execute()

    def delete_skill_override(
        self, user_id: str, baseline_version_id: int, skill_id: int
    ) -> None:
        self._db.table("cv_skill_overrides").delete().eq("user_id", user_id).eq(
            "baseline_version_id", baseline_version_id
        ).eq("skill_id", skill_id).execute()

    def update_hidden_items(
        self, version_id: int, user_id: str, hidden_items: list[str], body_text: str
    ) -> dict[str, Any]:
        """Auto-save the playground projection in place on a job's deterministic
        working draft. Scoped to kind="deterministic" so submitted / edited /
        polished snapshots stay immutable (CVJT1). 404 if it isn't the caller's
        editable draft. user_id filter is defensive — RLS also scopes.
        """
        result = (
            self._db.table("cv_versions")
            .update({"hidden_items": hidden_items, "body_text": body_text})
            .eq("id", version_id)
            .eq("user_id", user_id)
            .eq("kind", "deterministic")
            .execute()
        )
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Editable CV draft not found.",
            )
        return result.data[0]

    def set_master_hidden_items(
        self, user_id: str, hidden_items: list[str]
    ) -> dict[str, Any]:
        """Set the living master's shape (which bullets it shows) — the Delta-4
        promote path: the CV a user just applied with becomes their living master
        (project_living_cv_delta4). Only hidden_items changes; the master's
        immutable body_text / cv_structured content is untouched (a hidden bullet
        is kept-but-hidden, so it's reversible and never globally deleted).

        Scoped to the latest baseline_upload so no history row is rewritten. 404
        if the user has no baseline yet.
        """
        master = self.latest_baseline(user_id)
        if master is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Upload a baseline CV first.",
            )
        result = (
            self._db.table("cv_versions")
            .update({"hidden_items": hidden_items})
            .eq("id", int(master["id"]))
            .eq("user_id", user_id)
            .eq("kind", "baseline_upload")
            .execute()
        )
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not update your Main CV.",
            )
        return result.data[0]

    # ── living-master autosave (PR-3) ─────────────────────────────────────────
    # "Master" ≡ latest_baseline. Autosave MUTATES it in place instead of
    # appending a new baseline_upload row (the pile the living-master grill
    # called the bug), snapshotting the prior content into cv_master_revisions
    # first so nothing is ever lost. Migration 20260603_cv_master_revisions.

    def _next_master_revision_number(self, master_version_id: int) -> int:
        result = (
            self._db.table("cv_master_revisions")
            .select("revision_number")
            .eq("master_version_id", master_version_id)
            .order("revision_number", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            return 1
        return int(result.data[0].get("revision_number") or 0) + 1

    def list_master_revisions(self, user_id: str, limit: int = 60) -> list[dict[str, Any]]:
        master = self.latest_baseline(user_id)
        if master is None:
            return []
        result = (
            self._db.table("cv_master_revisions")
            .select("id, master_version_id, revision_number, body_text, cv_structured, snapshot_hash, created_at")
            .eq("user_id", user_id)
            .eq("master_version_id", master["id"])
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    def find_master_revision(self, revision_id: int, user_id: str) -> dict[str, Any] | None:
        result = (
            self._db.table("cv_master_revisions")
            .select("id, master_version_id, revision_number, body_text, cv_structured, snapshot_hash, created_at")
            .eq("id", revision_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    def update_master(
        self,
        user_id: str,
        *,
        body_text: str,
        cv_structured: dict[str, Any],
        snapshot_hash: str | None = None,
        hidden_items: list[str] | None = None,
    ) -> dict[str, Any]:
        """Non-destructive autosave of the user's Main CV (master ≡ latest_baseline).

        1. Snapshot the CURRENT master content into cv_master_revisions.
        2. Mutate the master row in place; reset recompute_finished_at so the
           score-ring shimmer reflects the pending async re-tag (SE4/SE17).

        Returns the updated master row. Raises 404 if no baseline exists yet.
        """
        master = self.latest_baseline(user_id)
        if master is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Upload a baseline CV first.",
            )
        master_id = int(master["id"])

        # 1. Preserve the prior state before overwriting (append-only history).
        self._db.table("cv_master_revisions").insert({
            "user_id":           user_id,
            "master_version_id": master_id,
            "revision_number":   self._next_master_revision_number(master_id),
            "body_text":         master.get("body_text") or "",
            "cv_structured":     master.get("cv_structured") or {},
            "snapshot_hash":     master.get("snapshot_hash"),
        }).execute()

        # 2. Mutate the master. user_id filter is defensive (RLS also scopes).
        patch: dict[str, Any] = {
            "body_text":             body_text,
            "cv_structured":         cv_structured or {},
            "snapshot_hash":         snapshot_hash,
            "confidence_label":      "user-edited",
            "recompute_finished_at": None,
        }
        # Restore also carries the applied shape (Delta-4); a plain autosave leaves
        # hidden_items untouched.
        if hidden_items is not None:
            patch["hidden_items"] = hidden_items
        result = (
            self._db.table("cv_versions")
            .update(patch)
            .eq("id", master_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not save your CV.",
            )
        return result.data[0]

    # ── cv_versions: the writer seam ──────────────────────────────────────────

    def create(self, user_id: str, spec: CVVersionWriteSpec) -> dict[str, Any]:
        """The single seam through which CV Versions enter the database.

        Computes user_version_number, propagates baseline_version_id from parent,
        and enforces every invariant defined on CVVersionWriteSpec.
        """
        self._validate_kind_job_id(spec)

        parent_row: dict[str, Any] | None = None
        baseline_version_id: int | None = None

        if spec.kind == "baseline_upload":
            # Baselines have no parent; their baseline_version_id stays NULL.
            if spec.parent_version_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="baseline_upload versions cannot have a parent.",
                )
        else:
            if spec.parent_version_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Derivative versions require a parent_version_id.",
                )
            parent_row = self.find(spec.parent_version_id, user_id)
            if not parent_row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Parent version not found.",
                )
            # Propagate baseline anchor: parent's anchor if it has one (parent is itself a
            # derivative), otherwise parent.id (parent IS the baseline).
            baseline_version_id = parent_row.get("baseline_version_id") or parent_row["id"]
            if baseline_version_id is None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Cannot create a derivative against an orphan parent (no baseline anchor).",
                )

        next_n = self.next_user_version_number(user_id)
        payload: dict[str, Any] = {
            "user_id":             user_id,
            "job_id":              spec.job_id,
            "kind":                spec.kind,
            "user_version_number": next_n,
            "parent_version_id":   spec.parent_version_id,
            "baseline_version_id": baseline_version_id,
            "title":               spec.title,
            "cv_structured":       spec.cv_structured or {},
            "skills_detected":     spec.skills_detected,
            "body_text":           spec.body_text,
            "polished_text":       spec.polished_text,
            "hidden_items":        spec.hidden_items,
            "edited_items":        spec.edited_items,
            "snapshot_hash":       spec.snapshot_hash,
            "confidence_label":    spec.confidence_label,
            "proof_count":         spec.proof_count,
            "ai_polished":         spec.ai_polished,
            "ai_polish_used_at":   spec.ai_polish_used_at,
            "footer_mark_hidden":  spec.footer_mark_hidden,
        }
        result = self._db.table("cv_versions").insert(payload).execute()
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not persist CV version.",
            )
        return result.data[0]

    @staticmethod
    def _validate_kind_job_id(spec: CVVersionWriteSpec) -> None:
        if spec.kind == "baseline_upload":
            if spec.job_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="baseline_upload versions must have job_id = null.",
                )
        else:
            if not spec.job_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{spec.kind} versions require a job_id.",
                )

    # ── evidence summary reads (unchanged) ────────────────────────────────────

    def list_milestones(self, user_id: str, limit: int = 120) -> list[dict[str, Any]]:
        result = (
            self._db.table("user_milestones")
            .select("*")
            .eq("user_id", user_id)
            .order("milestone_date", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    def list_diary_log_dates(self, user_id: str, limit: int = 120) -> list[dict[str, Any]]:
        result = (
            self._db.table("daily_logs")
            .select("id, log_date")
            .eq("user_id", user_id)
            .order("log_date", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    def list_user_skill_sources(self, user_id: str) -> list[dict[str, Any]]:
        result = (
            self._db.table("user_skills")
            .select("id, source, last_updated")
            .eq("user_id", user_id)
            .execute()
        )
        return result.data or []

    def count_user_skills(self, user_id: str) -> int:
        result = (
            self._db.table("user_skills")
            .select("id")
            .eq("user_id", user_id)
            .execute()
        )
        return len(result.data or [])

    def get_current_score(self, user_id: str) -> float | None:
        result = (
            self._db.table("mirror_scores")
            .select("total_score")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if result and result.data:
            return result.data.get("total_score")
        return None


# Backwards-compatible alias — callers across the codebase still type-hint
# CVRepository. New code should use CVVersionsRepository directly.
CVRepository = CVVersionsRepository


def get_token_cv_repository(db: Client = Depends(get_user_db)) -> CVVersionsRepository:
    return CVVersionsRepository(db)
