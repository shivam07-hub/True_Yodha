"""career_reservoir — the Career Story Reservoir facade.

One deep module owning the dump → profile pipeline:

  ingest   an inflow entry (cv_dump_entries row: uploaded CV text, LinkedIn
           render, pasted notes) → story_extractor → reconciled roles + deduped
           STAR stories + one canonical pointer each (cv_points, story-linked).
  profile  the comprehensive career profile view: roles → stories → pointers,
           with metrics/skills/narrative — the "Myro understands my CV" surface.

Policy (Shivam, 2026-07-11): bulk-dump extraction AUTO-ACCEPTS into the
reservoir; the user curates after (archive-not-delete). Dedup is a silent
fold-in: a story whose embedding ~matches an existing one is skipped, never
prompted.

Runs on the durable Work Lane (ADR-0008): `story_ingest` is idempotent on its
entry id (processed_at guard) — at-least-once delivery is safe. Provider/budget
failure raises TransientJobError so RQ retries; the entry stays pending and is
visible as such in the toggle's progress line.
"""
from __future__ import annotations

import json
import logging
import math
import uuid
from typing import Any

from app.services import story_extractor
from app.services.background import LANE_FAST, TransientJobError, enqueue, handler

logger = logging.getLogger("myro.career_reservoir")

DEDUP_COSINE = 0.90   # ≥ this vs an existing story = same achievement → fold (skip)
_EMBED_CAP = 400      # dedup candidate cap (users have tens of stories, not thousands)

JOB_TYPE_INGEST = "story_ingest"


# ── pure helpers ─────────────────────────────────────────────────────────────

def _norm(text: str) -> str:
    return " ".join((text or "").lower().split())


def _dates_match(a: str, b: str) -> bool:
    """Same-period signal: date labels with identical word tokens after stripping
    dash/en-dash punctuation ('July 2024 - April 2025' == 'July 2024 – April 2025')."""
    def tokens(label: str) -> list[str]:
        return [t for t in _norm(label).replace("–", " ").replace("-", " ").split() if t]

    ta, tb = tokens(a), tokens(b)
    return bool(ta) and ta == tb


def reconcile_role(extracted: dict[str, Any], existing: list[dict[str, Any]]) -> str | None:
    """Match an extracted role to an existing career_roles row (same company AND
    ~same title, or same company for single-word titles). A second, date-gated
    pass catches CROSS-SLOT extractions — one CV lists a team as the company,
    another as the title — merging only when the date labels are identical.
    None → mint a new role. Deliberately conservative: a wrong merge pollutes a
    container; a miss just creates a role the user can merge later."""
    company = _norm(extracted.get("company") or "")
    title = _norm(extracted.get("title") or "")
    date_label = extracted.get("date_label") or ""
    for row in existing:
        row_company = _norm(row.get("company") or "")
        row_title = _norm(row.get("title") or "")
        if company and row_company and (company in row_company or row_company in company):
            if title == row_title:
                return str(row["id"])
            title_words = set(title.split())
            row_words = set(row_title.split())
            if title_words and row_words:
                overlap = len(title_words & row_words) / min(len(title_words), len(row_words))
                if overlap >= 0.6:
                    return str(row["id"])
        elif not company and not row_company and title and title == row_title:
            return str(row["id"])
    # Cross-slot pass: same exact period AND the extracted company matches the
    # row's title (or vice versa) → the same role sliced differently upstream.
    for row in existing:
        if not _dates_match(date_label, row.get("date_label") or ""):
            continue
        row_company = _norm(row.get("company") or "")
        row_title = _norm(row.get("title") or "")
        if (company and row_title and (company in row_title or row_title in company)) or (
            title and row_company and (title in row_company or row_company in title)
        ):
            return str(row["id"])
    return None


def _parse_vector(raw: Any) -> list[float] | None:
    """PostgREST returns pgvector columns as a '[0.1,0.2,...]' string."""
    if isinstance(raw, list):
        return [float(x) for x in raw]
    if isinstance(raw, str) and raw.startswith("["):
        try:
            return [float(x) for x in json.loads(raw)]
        except (json.JSONDecodeError, ValueError):
            return None
    return None


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


def is_duplicate(candidate: list[float], existing: list[list[float]], threshold: float = DEDUP_COSINE) -> bool:
    return any(cosine(candidate, vec) >= threshold for vec in existing)


def story_embed_text(story: dict[str, Any]) -> str:
    """The text a story is embedded on: title + pointer + result — the identity of
    the achievement, stable across rephrasings."""
    narrative = story.get("narrative") or {}
    return " | ".join(
        p for p in (
            story.get("title") or "",
            story.get("pointer") or "",
            narrative.get("result") or "",
        ) if p
    )


def pointer_section(story: dict[str, Any], role_kind: str | None) -> str:
    """cv_points.section for a story's pointer. Work-role stories are experience
    bullets; everything else (accolades, education, role-less) renders as a
    project-style bullet."""
    if role_kind in ("work", "volunteer") and story.get("kind") in ("project", "achievement"):
        return "exp_bullet"
    return "proj_bullet"


def build_profile_view(
    roles: list[dict[str, Any]],
    stories: list[dict[str, Any]],
    pointers: list[dict[str, Any]],
    pending_inflows: int = 0,
) -> dict[str, Any]:
    """The comprehensive profile: roles (work first, newest first) → their stories
    (each with narrative/metrics/skills + canonical pointer & variant count) +
    role-less stories under 'highlights'. Competencies = frequency-ranked skills
    across active stories."""
    by_story: dict[str, list[dict[str, Any]]] = {}
    for p in pointers:
        by_story.setdefault(str(p.get("story_id")), []).append(p)

    def story_out(s: dict[str, Any]) -> dict[str, Any]:
        pts = sorted(by_story.get(str(s["id"]), []), key=lambda p: (not p.get("is_canonical", False),))
        canonical = next((p for p in pts if p.get("is_canonical")), pts[0] if pts else None)
        return {
            "id": str(s["id"]),
            "kind": s.get("kind") or "project",
            "title": s.get("title") or "",
            "narrative": s.get("narrative") or {},
            "metrics": s.get("metrics") or [],
            "skills": s.get("skills") or [],
            "status": s.get("status") or "active",
            "pointer": (canonical or {}).get("text") or "",
            "variant_count": len(pts),
        }

    active = [s for s in stories if (s.get("status") or "active") == "active"]
    by_role: dict[str, list[dict[str, Any]]] = {}
    homeless: list[dict[str, Any]] = []
    for s in active:
        rid = s.get("role_id")
        (by_role.setdefault(str(rid), []) if rid else homeless).append(s)

    kind_rank = {"work": 0, "leadership": 1, "volunteer": 2, "education": 3, "other": 4}
    roles_sorted = sorted(
        [r for r in roles if (r.get("status") or "active") == "active"],
        key=lambda r: (kind_rank.get(r.get("kind") or "work", 4), str(r.get("created_at") or "")),
    )
    roles_out = []
    for r in roles_sorted:
        role_stories = by_role.get(str(r["id"]), [])
        if not role_stories:
            continue
        roles_out.append({
            "id": str(r["id"]),
            "company": r.get("company") or "",
            "title": r.get("title") or "",
            "location": r.get("location") or "",
            "date_label": r.get("date_label") or "",
            "kind": r.get("kind") or "work",
            "stories": [story_out(s) for s in role_stories],
        })

    skill_freq: dict[str, int] = {}
    for s in active:
        for skill in s.get("skills") or []:
            skill_freq[skill] = skill_freq.get(skill, 0) + 1
    competencies = [k for k, _ in sorted(skill_freq.items(), key=lambda kv: (-kv[1], kv[0]))][:24]

    return {
        "roles": roles_out,
        "highlights": [story_out(s) for s in homeless],
        "competencies": competencies,
        "story_count": len(active),
        "pending_inflows": pending_inflows,
    }


# ── ingest orchestration (Work Lane handler) ─────────────────────────────────

def enqueue_ingest(user_id: str, entry_id: str) -> None:
    enqueue(
        LANE_FAST,
        JOB_TYPE_INGEST,
        payload={"user_id": user_id, "entry_id": entry_id},
        correlation_id=entry_id,
    )


_REQUEUE_AFTER_SECONDS = 15 * 60
_last_requeue: dict[str, float] = {}  # per-process debounce; profile polls every 4s


def retry_stale_ingests(repo: Any, user_id: str) -> int:
    """Re-enqueue pending inflow entries whose ingest job died (worker redeploy,
    exhausted retries, flushed queue) — enqueue is idempotent on the entry id and
    the handler no-ops on processed_at, so a duplicate delivery is safe. Called
    from the profile read (the surface already polling while entries pend), so a
    stuck 'Reading N dumps' heals itself instead of pulsing forever."""
    import time
    from datetime import datetime, timezone

    now = time.time()
    requeued = 0
    for entry in repo.pending_entries(user_id):
        raw = entry.get("created_at")
        try:
            created = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            age = now - created.timestamp() if created.tzinfo else now - created.replace(tzinfo=timezone.utc).timestamp()
        except (ValueError, TypeError):
            age = _REQUEUE_AFTER_SECONDS  # unparseable timestamp → eligible
        if age < _REQUEUE_AFTER_SECONDS:
            continue
        entry_id = str(entry.get("id") or "")
        if not entry_id or now - _last_requeue.get(entry_id, 0.0) < _REQUEUE_AFTER_SECONDS:
            continue
        _last_requeue[entry_id] = now
        enqueue_ingest(user_id, entry_id)
        requeued += 1
    if requeued:
        logger.info("career_reservoir.requeued_stale user=%s entries=%d", user_id, requeued)
    return requeued


@handler(JOB_TYPE_INGEST)
async def _ingest_entry(payload: dict[str, Any], allow_retry: bool) -> None:
    from app.database import get_supabase_admin
    from app.repositories.career_reservoir import CareerReservoirRepository
    from app.services.llm_provider import get_paid_jobs_provider

    user_id = str(payload.get("user_id") or "")
    entry_id = str(payload.get("entry_id") or "")
    if not user_id or not entry_id:
        return

    repo = CareerReservoirRepository(get_supabase_admin())
    entry = repo.get_entry(user_id, entry_id)
    if not entry or entry.get("processed_at"):
        return  # unknown or already done — idempotent on at-least-once delivery

    # Foreign-document guard: a bulk dump can contain other people's CVs.
    # Deterministic + fail-open (see reservoir_identity) — skip only on a
    # confident owner mismatch, and record WHY so the skip is never silent.
    from app.services import reservoir_identity

    if reservoir_identity.classify_entry(entry, user_id) == "foreign":
        repo.mark_skipped(user_id, entry_id, entry.get("payload"), "foreign_owner")
        logger.warning(
            "metric reservoir.foreign_doc_skipped user=%s entry=%s file=%s",
            user_id, entry_id, (entry.get("payload") or {}).get("filename"),
        )
        return

    provider = get_paid_jobs_provider()
    extraction = await story_extractor.extract(entry.get("text") or "", provider)
    if extraction is None:
        if allow_retry:
            raise TransientJobError("provider/budget unavailable")
        return  # in-process path: stays pending, visible in the status line

    story_ids = await _persist_extraction(repo, user_id, entry_id, extraction, provider)
    repo.mark_processed(user_id, entry_id, story_ids)
    logger.info(
        "career_reservoir.ingested user=%s entry=%s stories=%d", user_id, entry_id, len(story_ids),
    )


async def _persist_extraction(
    repo: Any, user_id: str, entry_id: str, extraction: dict[str, list[dict[str, Any]]],
    provider: Any,
) -> list[str]:
    """Reconcile roles, FOLD duplicate stories into their canonical story (the
    alternate phrasing lands as a pointer variant — never dropped), persist the
    rest with their canonical pointer + embedding. Ambiguous near-matches go
    through one batched LLM judge call. Embedding failure never blocks a write
    (the story lands without one; dedup just can't see it yet)."""
    from app.services import story_dedup
    from app.services.embeddings import embed_texts

    existing_roles = repo.list_roles(user_id)
    role_ids: list[str | None] = []
    role_kinds: list[str] = []
    for extracted_role in extraction.get("roles") or []:
        matched = reconcile_role(extracted_role, existing_roles)
        if matched is None:
            row = repo.add_role(user_id, extracted_role)
            matched = str(row.get("id") or "") or None
            if matched:
                existing_roles.append(row)
        role_ids.append(matched)
        role_kinds.append(extracted_role.get("kind") or "work")

    stories = extraction.get("stories") or []
    if not stories:
        return []

    embed_inputs = [story_embed_text(s) for s in stories]
    vectors: list[list[float] | None] = [None] * len(stories)
    try:
        vectors = list(await embed_texts(embed_inputs))  # type: ignore[arg-type]
    except Exception as exc:  # noqa: BLE001 — embedding is best-effort, never blocks ingest
        logger.info("career_reservoir: embed failed (%s) — storing without vectors", exc.__class__.__name__)

    candidates: list[tuple[str, list[float]]] = []
    rows_by_id: dict[str, dict[str, Any]] = {}
    for row in repo.story_dedup_rows(user_id)[:_EMBED_CAP]:
        vec = _parse_vector(row.get("embedding"))
        if vec is None:
            continue
        sid = str(row["id"])
        candidates.append((sid, vec))
        rows_by_id[sid] = row

    def role_of(story: dict[str, Any]) -> tuple[str | None, str | None]:
        ri = story.get("role_index")
        if isinstance(ri, int) and 0 <= ri < len(role_ids):
            return role_ids[ri], role_kinds[ri]
        return None, None

    created: list[str] = []
    deferred: list[tuple[dict[str, Any], list[float] | None, str]] = []
    for i, story in enumerate(stories):
        vec = vectors[i] if i < len(vectors) else None
        target_id, score = story_dedup.best_match(vec, candidates) if vec else (None, 0.0)
        verdict = story_dedup.classify(score) if target_id else "new"
        if verdict == "new":
            twin = story_dedup.find_title_twin(str(story.get("title") or ""), rows_by_id)
            if twin:
                target_id, verdict = twin, "judge"
        if verdict == "fold":
            _fold_into(repo, user_id, entry_id, rows_by_id[target_id], story, role_of(story)[1])
            continue
        if verdict == "judge":
            deferred.append((story, vec, target_id))  # type: ignore[arg-type]
            continue
        _create_story(repo, user_id, entry_id, story, role_of(story), vec, created, candidates, rows_by_id)

    if deferred:
        pairs = [{"new": s, "existing": rows_by_id[tid]} for s, _, tid in deferred]
        flags = await story_dedup.judge_pairs(pairs, provider)
        for (story, vec, target_id), same in zip(deferred, flags):
            if same:
                _fold_into(repo, user_id, entry_id, rows_by_id[target_id], story, role_of(story)[1])
            else:
                _create_story(repo, user_id, entry_id, story, role_of(story), vec, created, candidates, rows_by_id)

    return created


def _create_story(
    repo: Any, user_id: str, entry_id: str, story: dict[str, Any],
    role: tuple[str | None, str | None], vec: list[float] | None,
    created: list[str], candidates: list[tuple[str, list[float]]],
    rows_by_id: dict[str, dict[str, Any]],
) -> None:
    from app.services.embeddings import to_pgvector

    role_id, role_kind = role
    row = repo.add_story(user_id, {
        "role_id": role_id,
        "kind": story.get("kind"),
        "title": story.get("title"),
        "narrative": story.get("narrative"),
        "metrics": story.get("metrics"),
        "skills": story.get("skills"),
        "source": "ingest",
        "inflow_ids": [entry_id],
    })
    story_id = str(row.get("id") or "")
    if not story_id:
        return
    created.append(story_id)
    if vec:
        candidates.append((story_id, vec))  # in-batch dedup folds later dupes here
        rows_by_id[story_id] = {**story, "id": story_id, "inflow_ids": [entry_id]}
        try:
            repo.set_story_embedding(user_id, story_id, to_pgvector(vec))
        except Exception:  # noqa: BLE001
            logger.info("career_reservoir: embedding write failed story=%s", story_id)

    pointer = (story.get("pointer") or "").strip()
    if pointer:
        try:
            repo.add_story_pointer(
                user_id, story_id,
                point_key=str(uuid.uuid4()),
                section=pointer_section(story, role_kind),
                text=pointer,
                ordering=float(len(created)),
            )
        except Exception:  # noqa: BLE001 — a pointer miss leaves a curatable story
            logger.info("career_reservoir: pointer write failed story=%s", story_id)


def _fold_into(
    repo: Any, user_id: str, entry_id: str, target_row: dict[str, Any],
    story: dict[str, Any], role_kind: str | None,
) -> None:
    """Merge a same-achievement story into its canonical: the incoming pointer
    attaches as a variant (the old-CV angle stays selectable), metrics/skills
    union in, provenance appends. Failure degrades to the pre-fold behaviour
    (achievement already in the reservoir) — logged, never raised."""
    from app.services import story_dedup

    target_id = str(target_row.get("id") or "")
    if not target_id:
        return
    try:
        pointer = (story.get("pointer") or "").strip()
        if pointer:
            existing = repo.story_pointers(user_id, [target_id])
            texts = [p.get("text") or "" for p in existing]
            if story_dedup.pointer_is_new(pointer, texts):
                repo.add_story_pointer(
                    user_id, target_id,
                    point_key=str(uuid.uuid4()),
                    section=pointer_section(story, role_kind),
                    text=pointer,
                    ordering=float(len(existing) + 1),
                    is_canonical=False,
                )

        updates: dict[str, Any] = {}
        merged_m = story_dedup.merged_metrics(target_row.get("metrics") or [], story.get("metrics") or [])
        if merged_m != (target_row.get("metrics") or []):
            updates["metrics"] = merged_m
        merged_s = story_dedup.merged_skills(target_row.get("skills") or [], story.get("skills") or [])
        if merged_s != (target_row.get("skills") or []):
            updates["skills"] = merged_s
        inflows = list(target_row.get("inflow_ids") or [])
        if entry_id not in inflows:
            updates["inflow_ids"] = inflows + [entry_id]
        if updates:
            repo.update_story(user_id, target_id, updates)
            target_row.update(updates)  # keep the in-batch view current
    except Exception as exc:  # noqa: BLE001 — a failed fold leaves a curatable dupe-free reservoir
        logger.info("career_reservoir: fold failed story=%s reason=%s", target_id, exc.__class__.__name__)
