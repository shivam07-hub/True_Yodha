"""role_dedup — backlog #38: the role-merge judge.

The mit20 case (69 fragmented role rows) proved deterministic `reconcile_role`
cannot see that "I&D India Sales Manager" and "GTM BD Manager, GCC Growth" are
one job — that needs world knowledge + date reasoning. This module is the
productized version of that hand-run, mirroring `story_dedup`'s two-stage shape:

  1. deterministic candidate pairs — same company family OR same-kind roles with
     overlapping date windows (pure, no LLM, capped per run)
  2. ONE batched JUDGMENT-lane call per run → per-pair verdict:
       high      → auto-fold (stories move to the keep role; dup archives —
                   archive-only, restorable in Stories curation)
       maybe     → recorded as `proposed` → a Stories-tab merge card; the USER
                   rules
       different → recorded so the pair is never re-judged

A HUMAN ruling is LAW (`role_merge_verdicts.decided_by='user'`) — decided pairs
are excluded from candidates forever. Labels: the kept row's company/title stay
EXACTLY as extracted (the user's own words); the ONE deterministic touch is
widening `date_label` to the union of merged periods. No LLM-authored labels in
the reservoir (JD-aligned label framing lives in the tailoring layer only).

Judge = `get_judgment_provider()` (no-cheap-models law); fail-soft = keep
separate. Pair-text carries company + title + dates + story titles — a starved
judge returns all-different (Lane A lesson).
"""
from __future__ import annotations

import logging
import re
from typing import Any

from app.services.llm_provider import LLMProvider, LLMProviderError, get_judgment_provider

logger = logging.getLogger("myro.role_dedup")

MAX_PAIRS_PER_RUN = 24     # one batched call; sweeps converge across runs
SWEEP_MIN_ROLES = 12       # lazy Stories-visit sweep fires above this
_MAX_JUDGE_TOKENS = 1200
_STORY_TITLES_PER_ROLE = 3

_JUDGE_SYSTEM = (
    "You compare pairs of ROLE CONTAINERS from ONE person's career history, "
    "extracted from their own CVs and documents. For each pair decide whether "
    "A and B are the SAME role recorded twice under different labels, or "
    "genuinely different roles.\n"
    "Same-role signals: one job/degree/engagement written two ways — team name "
    "vs employer name, formal title vs informal title, employer vs product "
    "name, abbreviations (MIT Manipal == Manipal Institute of Technology), "
    "identical or near-identical date ranges, the same stories underneath.\n"
    "Different-role signals: career progression at one employer (different "
    "periods or clearly different jobs), distinct organisations, concurrent "
    "but genuinely separate engagements.\n"
    'Verdicts: "high" ONLY when you are certain they are the same role; '
    '"maybe" when plausibly the same but a human should confirm; '
    '"different" otherwise or when unsure.\n'
    'Return ONLY a compact JSON array, one item per pair in order: '
    '[{"index": int, "verdict": "high"|"maybe"|"different"}].'
)

_YEAR_RE = re.compile(r"(?:19|20)\d{2}|'(\d{2})")
_PRESENT_RE = re.compile(r"present|current|now|ongoing", re.IGNORECASE)
_PRESENT_END = 9999


# ── pure: normalization + dates ──────────────────────────────────────────────

def _norm(text: str) -> str:
    return " ".join(re.sub(r"[^\w\s&]", " ", (text or "").lower()).split())


def parse_years(date_label: str) -> tuple[int, int] | None:
    """Coarse (start_year, end_year) from a free-form date label; Present → open
    end. None when no year is recognisable."""
    label = date_label or ""
    years: list[int] = []
    for m in _YEAR_RE.finditer(label):
        if m.group(1) is not None:  # 'NN shorthand
            years.append(2000 + int(m.group(1)))
        else:
            years.append(int(m.group(0)))
    if not years:
        return None
    start = min(years)
    end = _PRESENT_END if _PRESENT_RE.search(label) else max(years)
    return (start, max(start, end))


def ranges_overlap(a: tuple[int, int] | None, b: tuple[int, int] | None) -> bool:
    if a is None or b is None:
        return False
    return a[0] <= b[1] and b[0] <= a[1]


def same_company_family(a: str, b: str) -> bool:
    """Same employer family across spellings: normalized containment either way
    ("capgemini" ⊂ "capgemini gcc growth"), or a shared significant first token."""
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return False
    if na in nb or nb in na:
        return True
    # Shared significant first token ("jll technologies" / "jll technology").
    # ≥3 keeps acronym employers; over-generation is safe — a family match only
    # nominates a CANDIDATE, the judge is the filter.
    ta, tb = na.split()[0], nb.split()[0]
    return len(ta) >= 3 and ta == tb


def pair_key(role_a: str, role_b: str) -> tuple[str, str]:
    """Normalized (min, max) — one row per pair regardless of direction."""
    return (role_a, role_b) if role_a < role_b else (role_b, role_a)


def candidate_pairs(
    roles: list[dict[str, Any]], decided: set[tuple[str, str]],
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Deterministic dupe-suspect pairs among ACTIVE roles, minus every decided
    pair. Same-family pairs rank first (highest yield), then same-kind roles
    with overlapping date windows (catches cross-name twins like MIT Manipal /
    Manipal Institute of Technology). Capped — sweeps converge across runs."""
    active = [r for r in roles if (r.get("status") or "active") == "active"]
    family: list[tuple[dict[str, Any], dict[str, Any]]] = []
    dated: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for i in range(len(active)):
        for j in range(i + 1, len(active)):
            a, b = active[i], active[j]
            if pair_key(str(a["id"]), str(b["id"])) in decided:
                continue
            if same_company_family(a.get("company") or "", b.get("company") or ""):
                family.append((a, b))
            elif (a.get("kind") or "work") == (b.get("kind") or "work") and ranges_overlap(
                parse_years(a.get("date_label") or ""), parse_years(b.get("date_label") or "")
            ):
                dated.append((a, b))
    return (family + dated)[:MAX_PAIRS_PER_RUN]


def role_text(role: dict[str, Any], story_titles: list[str]) -> str:
    """Everything the judge can use — starved pair-text = all-different."""
    parts = [
        f"{role.get('company') or '(no company)'} · {role.get('title') or '(no title)'}",
        f"dates: {role.get('date_label') or '(none)'} · kind: {role.get('kind') or 'work'}",
    ]
    if story_titles:
        parts.append("stories: " + "; ".join(story_titles[:_STORY_TITLES_PER_ROLE]))
    return "\n  ".join(parts)


def build_judge_messages(pair_texts: list[tuple[str, str]]) -> list[dict[str, str]]:
    blocks = [
        f"PAIR {i}\nA: {a}\nB: {b}" for i, (a, b) in enumerate(pair_texts)
    ]
    return [
        {"role": "system", "content": _JUDGE_SYSTEM},
        {"role": "user", "content": "\n\n".join(blocks)},
    ]


def parse_judge(raw: str, n: int) -> list[str]:
    """Per-pair verdicts, defaulting 'different' on anything malformed."""
    import json

    verdicts = ["different"] * n
    text = (raw or "").strip()
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end <= start:
        return verdicts
    try:
        items = json.loads(text[start:end + 1])
    except (ValueError, TypeError):
        return verdicts
    if not isinstance(items, list):
        return verdicts
    for item in items:
        if not isinstance(item, dict):
            continue
        idx = item.get("index")
        verdict = str(item.get("verdict") or "").lower()
        if isinstance(idx, int) and 0 <= idx < n and verdict in {"high", "maybe", "different"}:
            verdicts[idx] = verdict
    return verdicts


def pick_keep(
    a: dict[str, Any], b: dict[str, Any], story_counts: dict[str, int],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """(keep, dup): most active stories wins; tie → the earlier-created row."""
    ca = story_counts.get(str(a["id"]), 0)
    cb = story_counts.get(str(b["id"]), 0)
    if ca != cb:
        return (a, b) if ca > cb else (b, a)
    return (a, b) if str(a.get("created_at") or "") <= str(b.get("created_at") or "") else (b, a)


def widened_date_label(keep_label: str, dup_label: str) -> str | None:
    """Deterministic union of the two periods — the ONE label touch the lock
    allows. Only when both parse and the dup genuinely extends the keep;
    None = leave the keep's label alone."""
    keep_range, dup_range = parse_years(keep_label or ""), parse_years(dup_label or "")
    if keep_range is None or dup_range is None:
        return None
    if dup_range[0] >= keep_range[0] and dup_range[1] <= keep_range[1]:
        return None
    start = min(keep_range[0], dup_range[0])
    end = max(keep_range[1], dup_range[1])
    return f"{start} – {'Present' if end == _PRESENT_END else end}"


# ── judge (batched, fail-soft) ───────────────────────────────────────────────

async def judge_role_pairs(pair_texts: list[tuple[str, str]], provider: LLMProvider) -> list[str]:
    """One batched call. Provider failure → all 'different' (fold nothing)."""
    if not pair_texts:
        return []
    try:
        raw = await provider.complete(build_judge_messages(pair_texts), max_tokens=_MAX_JUDGE_TOKENS)
    except LLMProviderError:
        logger.info("role_dedup: judge unavailable — treating %d pairs as different", len(pair_texts))
        return ["different"] * len(pair_texts)
    return parse_judge(raw, len(pair_texts))


# ── apply (archive-only, mirrors repair_reservoir semantics) ─────────────────

def apply_fold(db: Any, user_id: str, keep: dict[str, Any], dup: dict[str, Any]) -> None:
    """Stories move to the keep role; the dup archives; the keep's date_label may
    widen deterministically. Company/title stay the user's own words."""
    db.table("career_stories").update({"role_id": str(keep["id"])}).eq(
        "user_id", user_id
    ).eq("role_id", str(dup["id"])).execute()
    db.table("career_roles").update({"status": "archived"}).eq(
        "user_id", user_id
    ).eq("id", str(dup["id"])).execute()
    widened = widened_date_label(keep.get("date_label") or "", dup.get("date_label") or "")
    if widened:
        db.table("career_roles").update({"date_label": widened}).eq(
            "user_id", user_id
        ).eq("id", str(keep["id"])).execute()


def record_verdict(
    db: Any, user_id: str, role_a: str, role_b: str, verdict: str, decided_by: str = "judge",
) -> None:
    a, b = pair_key(role_a, role_b)
    db.table("role_merge_verdicts").upsert(
        {
            "user_id": user_id, "role_a": a, "role_b": b,
            "verdict": verdict, "decided_by": decided_by,
        },
        on_conflict="user_id,role_a,role_b",
    ).execute()


# ── the run (post-ingest incremental AND the lazy Stories-visit sweep) ────────

async def run_role_dedup(user_id: str, *, provider: LLMProvider | None = None) -> dict[str, int]:
    """Full pass over the user's active roles: candidates minus decided pairs →
    one batched judge → fold high / propose maybe / record different. Idempotent:
    every judged pair lands in role_merge_verdicts, so re-runs only see NEW pairs.
    Fail-soft everywhere — dedup garnishes the reservoir, never breaks ingest."""
    from app.database import get_supabase_admin
    from app.db_safe import safe_read

    db = get_supabase_admin()
    roles = safe_read(
        db.table("career_roles").select("*").eq("user_id", user_id).order("created_at"),
        default=[], context="role_dedup_roles",
    )
    decided_rows = safe_read(
        db.table("role_merge_verdicts").select("role_a, role_b").eq("user_id", user_id),
        default=[], context="role_dedup_verdicts",
    )
    decided = {pair_key(str(r["role_a"]), str(r["role_b"])) for r in decided_rows}
    pairs = candidate_pairs(roles, decided)
    if not pairs:
        return {"judged": 0, "folded": 0, "proposed": 0}

    story_rows = safe_read(
        db.table("career_stories").select("role_id, title").eq("user_id", user_id).eq("status", "active"),
        default=[], context="role_dedup_stories",
    )
    titles_by_role: dict[str, list[str]] = {}
    counts: dict[str, int] = {}
    for row in story_rows:
        rid = str(row.get("role_id") or "")
        if not rid:
            continue
        counts[rid] = counts.get(rid, 0) + 1
        titles_by_role.setdefault(rid, []).append(str(row.get("title") or ""))

    pair_texts = [
        (role_text(a, titles_by_role.get(str(a["id"]), [])),
         role_text(b, titles_by_role.get(str(b["id"]), [])))
        for a, b in pairs
    ]
    verdicts = await judge_role_pairs(pair_texts, provider or get_judgment_provider())

    folded = proposed = 0
    for (a, b), verdict in zip(pairs, verdicts):
        if verdict == "high":
            keep, dup = pick_keep(a, b, counts)
            apply_fold(db, user_id, keep, dup)
            record_verdict(db, user_id, str(a["id"]), str(b["id"]), "auto_folded")
            folded += 1
        elif verdict == "maybe":
            record_verdict(db, user_id, str(a["id"]), str(b["id"]), "proposed")
            proposed += 1
        else:
            record_verdict(db, user_id, str(a["id"]), str(b["id"]), "keep_separate")
    logger.info(
        "metric role_dedup.run user=%s judged=%d folded=%d proposed=%d",
        user_id, len(pairs), folded, proposed,
    )
    return {"judged": len(pairs), "folded": folded, "proposed": proposed}
