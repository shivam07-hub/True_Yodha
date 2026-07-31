"""
formulas.py
Pure scoring formulas — no I/O, no Supabase. Deterministic, easily unit-testable.

Pipeline:
  signals → proficiency level (P1 Scout … P5 Legend)
  level map → cluster_score (Tax-L2)
  cluster_scores → domain_score (Tax-L1)
  domain_scores → mirror_score (0–100)
"""

import math
from functools import lru_cache

_SIGNAL_LEVEL_MAP = {
    "mention":       1,   # P1 Scout       — named in skills section only
    "project":       2,   # P2 Trailblazer — used in a real project
    "impact":        3,   # P3 Excavator   — measurable metrics
    "leadership":    4,   # P4 Cartographer — led design / architecture
    "certification": 3,   # P3 Excavator   — third-party cert
}

_PROFICIENCY_TITLES: dict[int, str] = {
    0: "None",
    1: "Scout",
    2: "Trailblazer",
    3: "Excavator",
    4: "Cartographer",
    5: "Legend",
}

# ── Seniority band → scoring denominator ──────────────────────────────────────
# The Mirror Score is band-relative: a candidate is measured against the
# proficiency their STAGE requires, not against L5 "Legend". Scoring an
# entry-level fresher against L5 structurally caps them (the beta bug: mean
# 15.7/100). Coarse by design — grill-locked. Keys are the canonical seniority
# bands from job_eligibility (intern/entry/mid/senior/lead/executive).
TARGET_LEVEL_BY_BAND: dict[str, int] = {
    "intern":    2,
    "entry":     2,
    "mid":       3,
    "senior":    4,
    "lead":      5,
    "executive": 5,
}
DEFAULT_TARGET_LEVEL = 2  # entry — the default band when none is set


def target_level_for_seniority(seniority: str | None) -> int:
    """Coarse band → the proficiency level the score is measured against.

    Unknown / null / 'any' → entry (L2). Callers should pass a band already
    normalized by ``job_eligibility.target_seniority_for_profile`` so aliases
    (junior→entry, director→executive) resolve upstream; this is the final
    lookup with a safe entry default.
    """
    key = (seniority or "").strip().lower()
    return TARGET_LEVEL_BY_BAND.get(key, DEFAULT_TARGET_LEVEL)

# Days to close a single proficiency step (current → current+1)
_DAYS_PER_STEP: dict[tuple[int, int], int] = {
    (0, 1): 1,
    (1, 2): 2,
    (2, 3): 5,
    (3, 4): 14,
    (4, 5): 30,
}


# ── Taxonomy cluster maps ─────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _build_cluster_maps() -> tuple[dict[str, list[str]], dict[str, str], dict[str, str]]:
    """
    Builds cluster lookup tables from the Lightcast taxonomy JSON. Cached.

    Returns:
      cluster_children  — {Tax-L2 cluster: [Tax-L3 skill names...]}
      skill_to_cluster  — {skill name: cluster name}
      cluster_to_domain — {cluster name: Tax-L1 domain name}
    """
    from app.services.taxonomy_loader import get_all_skills
    cluster_children: dict[str, list[str]] = {}
    skill_to_cluster: dict[str, str] = {}
    cluster_to_domain: dict[str, str] = {}
    for skill in get_all_skills():
        cluster = skill.l2_cluster or "General"
        domain = skill.l1_domain or "General"
        cluster_children.setdefault(cluster, []).append(skill.name)
        skill_to_cluster[skill.name] = cluster
        cluster_to_domain[cluster] = domain
    return cluster_children, skill_to_cluster, cluster_to_domain


# ── Proficiency inference (signals → level) ───────────────────────────────────

def infer_level_from_signals(signals: list[dict]) -> int:
    """
    Returns proficiency level 0–5 from a skill's CV signals.

    Signal types → base level:
      mention / project / impact / leadership / certification (see _SIGNAL_LEVEL_MAP)
      years_experience → no base level, XP only

    Highest base level wins. Total XP ≥ 1000 boosts one level (depth evidence).
    """
    if not signals:
        return 0
    level = max(_SIGNAL_LEVEL_MAP.get(s["signal_type"], 0) for s in signals)
    total_xp = sum(s["xp_awarded"] for s in signals)
    if total_xp >= 1000 and level < 5:
        level += 1
    return min(level, 5)


def build_skill_level_map(skills_detected: list[dict]) -> dict[str, int]:
    """Groups signals by taxonomy_key → {taxonomy_key: inferred_level}."""
    grouped: dict[str, list[dict]] = {}
    for signal in skills_detected:
        grouped.setdefault(signal["taxonomy_key"], []).append(signal)
    return {key: infer_level_from_signals(sigs) for key, sigs in grouped.items()}


def best_evidence_by_key(skills_detected: list[dict]) -> dict[str, str]:
    """Groups signals by taxonomy_key → the strongest receipt we hold for each.

    A skill is routinely detected twice: once in an achievement bullet and once
    in the CV's skills paragraph. Both are stored, but only one is shown, so the
    choice decides whether the user sees "Edited 20+ advertisement videos" or
    "Video Editing" as the reason we scored them. Rank by signal strength — the
    same ordering that sets the level — then prefer the longer phrase, since a
    fuller quote is a better receipt.

    Evidence is display-only and never scored, so this changes what we can
    honestly show, not what anyone is worth.
    """
    best: dict[str, tuple[int, int, str]] = {}
    for signal in skills_detected:
        key = signal["taxonomy_key"]
        evidence = str(signal.get("evidence") or "").strip()
        rank = (
            _SIGNAL_LEVEL_MAP.get(signal.get("signal_type", ""), 0),
            len(evidence),
        )
        current = best.get(key)
        if current is None or rank > (current[0], current[1]):
            best[key] = (rank[0], rank[1], evidence)
    return {key: value[2] for key, value in best.items()}


# ── Score formulas ────────────────────────────────────────────────────────────

def compute_cluster_scores(
    skill_level_map: dict[str, int],
    cluster_children: dict[str, list[str]],
    skill_to_cluster: dict[str, str],
    target_level: int = 5,
) -> dict[str, float]:
    """
    Returns {cluster_name: cluster_score} for clusters the user has ≥1 skill in.
    cluster_score = cluster_coverage × min(max_proficiency / target_level, 1.0)

    ``target_level`` is the band-relative denominator (see
    ``target_level_for_seniority``). Default 5 preserves the legacy absolute
    scale. The 1.0 cap means a candidate at or above their band's target gets
    full proficiency credit — never score inflation above it.

    Rewards users who are broad AND deep within a sub-skill cluster, not just
    those who name-dropped many skills.
    """
    denominator = target_level if target_level > 0 else 5
    user_by_cluster: dict[str, list[int]] = {}
    for skill, level in skill_level_map.items():
        cluster = skill_to_cluster.get(skill)
        if cluster:
            user_by_cluster.setdefault(cluster, []).append(level)

    result: dict[str, float] = {}
    for cluster, levels in user_by_cluster.items():
        total = len(cluster_children.get(cluster, []))
        if total == 0:
            continue
        # log1p scaling: 1 skill in a 362-skill cluster → 0.14 credit, not 0.003.
        # Proficiency floor (0.3) ensures having any skill in a domain counts.
        coverage_score = math.log1p(len(levels)) / math.log1p(total)
        max_prof = min(max(levels) / denominator, 1.0)
        result[cluster] = round(max_prof * (0.3 + 0.7 * coverage_score), 4)
    return result


def compute_domain_scores(
    cluster_scores: dict[str, float],
    cluster_to_domain: dict[str, str],
    cluster_skill_counts: dict[str, int] | None = None,
) -> dict[str, float]:
    """
    Domain score = skill-count-weighted mean(cluster_scores) × breadth_bonus × 100.

    cluster_skill_counts: {cluster: n_user_skills} — when provided, clusters with more
    skills get higher weight AND the total skill count drives a log breadth bonus.
    A domain with 7 skills at P2 scores higher than a domain with 2 skills at P2.
    """
    counts = cluster_skill_counts or {}
    by_domain: dict[str, list[tuple[float, int]]] = {}
    for cluster, score in cluster_scores.items():
        domain = cluster_to_domain.get(cluster, "General")
        n = counts.get(cluster, 1)
        by_domain.setdefault(domain, []).append((score, n))

    result: dict[str, float] = {}
    for domain, pairs in by_domain.items():
        total_n = sum(c for _, c in pairs)
        weighted_score = sum(s * c for s, c in pairs) / total_n
        # log1p(total_n - 1): 0 for 1 skill, scales to 1.0 at 20 skills
        breadth = math.log1p(total_n - 1) / math.log1p(19)
        domain_score = weighted_score * (1.0 + 0.5 * min(breadth, 1.0))
        result[domain] = round(domain_score * 100, 1)
    return result


def compute_mirror_score(domain_scores: dict[str, float]) -> float:
    """Mirror Score = mean of domain scores. 0–100."""
    if not domain_scores:
        return 0.0
    return round(sum(domain_scores.values()) / len(domain_scores), 1)


def project_total_with_skill_bump(
    skill_level_map: dict[str, int],
    skill_name: str,
    new_level: int,
    cluster_children: dict[str, list[str]],
    skill_to_cluster: dict[str, str],
    cluster_to_domain: dict[str, str],
    target_level: int = 5,
) -> float:
    """
    What-if total Mirror Score if `skill_name` were raised to `new_level`.

    Pure: runs the same cluster→domain→mirror pipeline over a copy of the level
    map with one skill bumped. Used to attach an honest projected point-gain to
    each gap skill ("practice this one level → +N pts") — never fabricated, it
    is the real engine re-run. Adding an absent skill (level 0 → 1) can introduce
    a new evidenced domain, which the mean-of-evidenced-domains formula reflects.

    ``target_level`` must match the score's band denominator so the projected
    gain lives in the same band-relative space as the displayed total.
    """
    bumped = dict(skill_level_map)
    bumped[skill_name] = new_level
    cluster_scores = compute_cluster_scores(bumped, cluster_children, skill_to_cluster, target_level)
    cluster_skill_counts = {
        cluster: sum(1 for s in bumped if skill_to_cluster.get(s) == cluster)
        for cluster in cluster_scores
    }
    domain_scores = compute_domain_scores(cluster_scores, cluster_to_domain, cluster_skill_counts)
    return compute_mirror_score(domain_scores)
