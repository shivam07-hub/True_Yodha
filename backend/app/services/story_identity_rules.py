"""Story identity rules — pure, deterministic: no DB, no model.

Every decision behind `story_identity` lives here so it can be tested directly:
which story pairs are candidates, which fold without a judge, which story
survives, what a fold and its undo change, and how the judge is asked and read.
`story_identity` owns the effects; the SQL functions in
20260912100100_story_identity_fold.sql apply a plan atomically.

Same achievement = the same work with the same outcome, said differently. A
part of a larger piece of work is its own achievement (Shivam, 2026-09-12).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.services.role_dedup import same_company_family

# Similarity only NOMINATES a pair. Measured on the one real reservoir
# (2026-09-12, 211 active stories): true duplicates scored 0.54–0.77, the
# median story's nearest neighbour scored 0.705, and two different schools
# scored 0.848 — so cosine can never decide sameness on its own.
NOMINATE_FLOOR = 0.60
# At or above this the two are the same document read twice — folds unjudged.
NEAR_VERBATIM = 0.97
_CAP = 8  # metric/skill union cap, matching what the extractor emits

Pair = tuple[str, str]

_JUDGE_SYSTEM = (
    "You compare pairs of career achievements from ONE person's history, "
    "extracted from their own CVs, LinkedIn and notes. For each pair answer:\n"
    '"same" — the same work with the same outcome, described differently '
    "(rephrased, reordered, another emphasis, written for another CV).\n"
    '"part_of" — one is a component, deliverable or step inside the other.\n'
    '"different" — separate work: different deliverables, periods, '
    "organisations, or outcomes that cannot be one event.\n"
    '"unsure" — you cannot tell from what is given.\n'
    "Identical metrics or scope point to same. Metrics that cannot describe one "
    "event point to different.\n"
    "Return ONLY a compact JSON array, one item per pair in order: "
    '[{"index": int, "verdict": "same"|"part_of"|"different"|"unsure"}].'
)

_OUTCOME = {"same": "fold", "part_of": "proposed", "unsure": "proposed", "different": "keep_separate"}


def pair_key(a: str, b: str) -> Pair:
    return (a, b) if a < b else (b, a)


def norm(text: str | None) -> str:
    return " ".join((text or "").lower().split())


# ── candidates ───────────────────────────────────────────────────────────────

def candidate_pairs(
    stories: list[dict[str, Any]],
    company_of_role: dict[str, str],
    sims: list[tuple[str, str, float]],
    decided: set[Pair],
) -> list[tuple[str, str, float]]:
    """Undecided pairs worth ruling on, most similar first.

    A pair at or above NOMINATE_FLOOR is a candidate when the two share an
    employer family, when one is the other's nearest neighbour (catches a story
    filed under the wrong role), or when either has no role. Two stories with
    the same title are candidates at any similarity."""
    by_id = {str(s["id"]): s for s in stories}
    sim_of: dict[Pair, float] = {}
    nearest: dict[str, tuple[str, float]] = {}
    for a, b, s in sims:
        a, b, s = str(a), str(b), float(s)
        if a not in by_id or b not in by_id or s < NOMINATE_FLOOR:
            continue
        sim_of[pair_key(a, b)] = s
        for x, y in ((a, b), (b, a)):
            if x not in nearest or s > nearest[x][1]:
                nearest[x] = (y, s)

    def company(sid: str) -> str:
        role_id = by_id[sid].get("role_id")
        return company_of_role.get(str(role_id), "") if role_id else ""

    out: dict[Pair, float] = {}
    for (a, b), s in sim_of.items():
        if (a, b) in decided:
            continue
        roleless = not by_id[a].get("role_id") or not by_id[b].get("role_id")
        is_nearest = nearest.get(a, ("", 0.0))[0] == b or nearest.get(b, ("", 0.0))[0] == a
        if roleless or is_nearest or same_company_family(company(a), company(b)):
            out[(a, b)] = s

    by_title: dict[str, list[str]] = {}
    for sid, story in by_id.items():
        title = norm(story.get("title"))
        if title:
            by_title.setdefault(title, []).append(sid)
    for ids in by_title.values():
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                key = pair_key(ids[i], ids[j])
                if key not in decided:
                    out.setdefault(key, sim_of.get(key, 0.0))

    return sorted(((a, b, s) for (a, b), s in out.items()), key=lambda t: (-t[2], t[0], t[1]))


def near_verbatim(similarity: float, canonical_a: str, canonical_b: str) -> bool:
    """The same document dropped twice: identical canonical phrasing, or a
    similarity no two different achievements reach."""
    a, b = norm(canonical_a), norm(canonical_b)
    return similarity >= NEAR_VERBATIM or (bool(a) and a == b)


def pick_keep(
    a: dict[str, Any], b: dict[str, Any], pointer_counts: dict[str, int],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """(keep, dup): more phrasings wins, then more provenance, then the older."""
    def rank(s: dict[str, Any]) -> tuple[int, int, str, str]:
        return (
            -pointer_counts.get(str(s["id"]), 0),
            -len(s.get("inflow_ids") or []),
            str(s.get("created_at") or ""),
            str(s["id"]),
        )
    return (a, b) if rank(a) <= rank(b) else (b, a)


# ── fold + undo plans ────────────────────────────────────────────────────────

def _metric_key(m: dict[str, Any]) -> str:
    return f"{norm(str(m.get('value') or ''))}|{norm(str(m.get('what') or ''))}"


def pointer_is_new(text: str, existing: list[str]) -> bool:
    n = norm(text)
    return bool(n) and all(norm(t) != n for t in existing)


@dataclass(frozen=True)
class FoldPlan:
    keep_id: str
    dup_id: str
    move_pointers: list[str]
    archive_pointers: list[str]
    keep_metrics: list[dict[str, Any]]
    keep_skills: list[str]
    keep_inflows: list[str]
    moved: dict[str, Any]  # the undo record written on the verdict row


def fold_plan(
    keep: dict[str, Any], dup: dict[str, Any],
    keep_pointers: list[dict[str, Any]], dup_pointers: list[dict[str, Any]],
) -> FoldPlan:
    """Every phrasing of the duplicate joins the survivor as an alternative,
    except ones the survivor already says (those archive). Metrics, skills and
    provenance union in. Nothing is deleted."""
    texts = [p.get("text") or "" for p in keep_pointers]
    moved: list[dict[str, Any]] = []
    archived: list[str] = []
    ordered = sorted(dup_pointers, key=lambda p: (not p.get("is_canonical"), float(p.get("ordering") or 0)))
    for p in ordered:
        text = p.get("text") or ""
        if pointer_is_new(text, texts):
            moved.append({"id": str(p["id"]), "was_canonical": bool(p.get("is_canonical"))})
            texts.append(text)
        else:
            archived.append(str(p["id"]))

    metrics = list(keep.get("metrics") or [])
    seen_m = {_metric_key(m) for m in metrics}
    added_m = [m for m in dup.get("metrics") or [] if _metric_key(m) not in seen_m][: max(0, _CAP - len(metrics))]
    skills = list(keep.get("skills") or [])
    seen_s = {norm(s) for s in skills}
    added_s: list[str] = []
    for s in dup.get("skills") or []:
        if norm(s) not in seen_s and len(skills) + len(added_s) < _CAP:
            seen_s.add(norm(s))
            added_s.append(s)
    inflows = [str(i) for i in keep.get("inflow_ids") or []]
    added_i = [str(i) for i in dup.get("inflow_ids") or [] if str(i) not in inflows]

    return FoldPlan(
        keep_id=str(keep["id"]),
        dup_id=str(dup["id"]),
        move_pointers=[m["id"] for m in moved],
        archive_pointers=archived,
        keep_metrics=metrics + added_m,
        keep_skills=skills + added_s,
        keep_inflows=inflows + added_i,
        moved={
            "dup_id": str(dup["id"]),
            "moved_pointers": moved,
            "archived_pointers": archived,
            "dup_added": {"metrics": added_m, "skills": added_s, "inflow_ids": added_i},
        },
    )


@dataclass(frozen=True)
class UnfoldPlan:
    keep_id: str
    dup_id: str
    back_canonical: list[str]
    back_variant: list[str]
    reactivate: list[str]
    keep_metrics: list[dict[str, Any]]
    keep_skills: list[str]
    keep_inflows: list[str]


def unfold_plan(verdict_row: dict[str, Any], keep_now: dict[str, Any]) -> UnfoldPlan:
    """Take back exactly what the fold added — correct even after later folds
    have landed on the same survivor."""
    moved = verdict_row.get("moved") or {}
    added = moved.get("dup_added") or {}
    added_m = {_metric_key(m) for m in added.get("metrics") or []}
    added_s = {norm(s) for s in added.get("skills") or []}
    added_i = {str(i) for i in added.get("inflow_ids") or []}
    pointers = moved.get("moved_pointers") or []
    return UnfoldPlan(
        keep_id=str(verdict_row["keep_id"]),
        dup_id=str(moved.get("dup_id") or ""),
        back_canonical=[str(p["id"]) for p in pointers if p.get("was_canonical")],
        back_variant=[str(p["id"]) for p in pointers if not p.get("was_canonical")],
        reactivate=[str(i) for i in moved.get("archived_pointers") or []],
        keep_metrics=[m for m in keep_now.get("metrics") or [] if _metric_key(m) not in added_m],
        keep_skills=[s for s in keep_now.get("skills") or [] if norm(s) not in added_s],
        keep_inflows=[str(i) for i in keep_now.get("inflow_ids") or [] if str(i) not in added_i],
    )


# ── judge ────────────────────────────────────────────────────────────────────

def story_text(story: dict[str, Any], company: str, pointer: str) -> str:
    """Everything the judge can tell two stories apart by. A starved pair-text
    returns all-different (the Lane A lesson)."""
    narrative = story.get("narrative") or {}
    metrics = ", ".join(
        f"{m.get('value')} ({m.get('what')})"
        for m in story.get("metrics") or [] if isinstance(m, dict) and m.get("value")
    )
    parts = [
        story.get("title") or "(untitled)",
        f"at: {company}" if company else "",
        pointer,
        *(narrative.get(k) or "" for k in ("situation", "task", "action", "result")),
        f"metrics: {metrics}" if metrics else "",
    ]
    return " | ".join(p for p in parts if p)


def build_judge_messages(pair_texts: list[tuple[str, str]]) -> list[dict[str, str]]:
    blocks = [f"PAIR {i}\nA: {a}\nB: {b}" for i, (a, b) in enumerate(pair_texts)]
    return [
        {"role": "system", "content": _JUDGE_SYSTEM},
        {"role": "user", "content": "\n\n".join(blocks)},
    ]


def parse_judge(raw: str, n: int) -> list[str | None]:
    """Per-pair verdicts. None where the answer is missing or malformed — the
    pair is judged again next sweep, never stamped with a guess."""
    verdicts: list[str | None] = [None] * n
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
        idx, verdict = item.get("index"), str(item.get("verdict") or "").lower()
        if isinstance(idx, int) and 0 <= idx < n and verdict in _OUTCOME:
            verdicts[idx] = verdict
    return verdicts


def outcome(verdict: str | None) -> str | None:
    """'fold' | 'proposed' | 'keep_separate', or None for no usable verdict."""
    return _OUTCOME.get(verdict or "")
