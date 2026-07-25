"""One-time cutover: recompute every stored Mirror Score under the new
seniority-band-relative engine (backlog: banded score redesign, Slices 2+3).

Why: the pre-band engine scored every candidate against L5 "Legend"
(``cluster_score = coverage × max_prof/5``), structurally capping juniors —
prod beta was mean 15.7/100, max 31. The banded engine measures each candidate
against the proficiency their STAGE requires (entry→L2 … lead/exec→L5).

What it does per run:
  1. For every user with a stored mirror_scores row, recompute the canonical
     projection (``scoring.recompute_score`` — the exact engine, now banded).
  2. After all totals land, compute per-band percentiles ("top X% for {band}")
     and write ``mirror_scores.percentile`` (Slice 3).
  3. Reset the trajectory baseline: the banded score is a new scale, so the
     old history/score_delta would show a fake jump. On --apply we snapshot the
     new total as the fresh baseline (recompute_score already appends history;
     we prune pre-cutover history rows for a clean trajectory start).

SAFE BY DEFAULT: dry-run. Prints the resulting distribution + tier/percentile
histograms and writes NOTHING. Pass --apply to write to prod (HITL — run only
with Shivam's sign-off; this touches the shared prod Supabase).

Usage:
    python -m scripts.recompute_banded_scores            # dry-run
    python -m scripts.recompute_banded_scores --apply     # writes prod
"""

from __future__ import annotations

import argparse
import statistics
from collections import Counter

from app.database import get_supabase_admin
from app.repositories.scores import ScoresRepository
from app.services import scoring
from app.services.job_eligibility import target_seniority_for_profile
from app.services.scoring.gap import compute_rank_tier
from app.services.scoring.percentile import band_percentiles


def _all_scored_user_ids(db) -> list[str]:
    rows = db.table("mirror_scores").select("user_id").execute().data or []
    return [r["user_id"] for r in rows if r.get("user_id")]


def _band_for(db, user_id: str) -> str:
    row = (
        db.table("user_profiles")
        .select("target_seniority")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    data = (row.data if row else {}) or {}
    return target_seniority_for_profile(data)


def _percentile_pass(db, results: list[dict], *, apply: bool) -> Counter:
    """Compute per-band percentile for every user and (optionally) persist it."""
    by_band: dict[str, list[tuple[str, float]]] = {}
    for r in results:
        by_band.setdefault(r["band"], []).append((r["user_id"], r["new_total"]))

    band_hist: Counter = Counter()
    for band, members in by_band.items():
        pct = band_percentiles([total for _, total in members])
        for (user_id, _total), percentile in zip(members, pct):
            band_hist[band] += 1
            for r in results:
                if r["user_id"] == user_id:
                    r["percentile"] = percentile
                    break
            if apply:
                db.table("mirror_scores").update({"percentile": percentile}).eq(
                    "user_id", user_id
                ).execute()
    return band_hist


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write to prod (HITL)")
    args = parser.parse_args()

    db = get_supabase_admin()
    repo = ScoresRepository(db)
    user_ids = _all_scored_user_ids(db)
    print(f"Found {len(user_ids)} scored users. mode={'APPLY' if args.apply else 'DRY-RUN'}\n")

    # Trajectory reset: the banded score is a new scale, so pre-cutover history
    # points would render a fake jump. Snapshot the max existing history id
    # before recompute appends fresh baselines, then prune everything at/below
    # it so each user starts a clean trajectory from their banded score.
    history_marker = 0
    if args.apply:
        rows = db.table("mirror_score_history").select("id").order("id", desc=True).limit(1).execute().data or []
        history_marker = int(rows[0]["id"]) if rows else 0

    results: list[dict] = []
    errors = 0
    for i, user_id in enumerate(user_ids, 1):
        try:
            inputs = repo.get_recompute_inputs(user_id)
            band = target_seniority_for_profile({"target_seniority": inputs.target_seniority})
            if args.apply:
                row = scoring.recompute_score(repo, user_id)
                new_total = float(row.get("total_score") or 0.0)
            else:
                proj = scoring.project_score(
                    repo,
                    inputs.skill_level_map,
                    include_market_signals=False,
                    target_seniority=inputs.target_seniority,
                )
                new_total = proj.total_score
            results.append({
                "user_id": user_id,
                "band": band,
                "new_total": new_total,
                "tier": compute_rank_tier(new_total),
            })
        except Exception as exc:  # noqa: BLE001 — one-time script, keep going + report
            errors += 1
            print(f"  [{i}/{len(user_ids)}] [REDACTED] FAILED: {exc.__class__.__name__}")

    if not results:
        print("No results computed.")
        return

    totals = [r["new_total"] for r in results]
    band_hist = _percentile_pass(db, results, apply=args.apply)

    q = statistics.quantiles(totals, n=4) if len(totals) > 1 else [totals[0]] * 3
    print("── New Mirror Score distribution ──")
    print(f"  n={len(totals)}  errors={errors}")
    print(f"  min={min(totals):.1f}  p25={q[0]:.1f}  median={q[1]:.1f}  p75={q[2]:.1f}  max={max(totals):.1f}")
    print(f"  mean={statistics.mean(totals):.1f}")

    print("\n── Band histogram ──")
    for band, n in sorted(band_hist.items(), key=lambda kv: -kv[1]):
        print(f"  {band:>10}: {n}")

    print("\n── Rank-tier histogram ──")
    tier_hist = Counter(r["tier"] for r in results)
    for _lo, _hi, tier in scoring._RANK_TIERS:
        print(f"  {tier:>13}: {tier_hist.get(tier, 0)}")

    if args.apply:
        if history_marker:
            db.table("mirror_score_history").delete().lte("id", history_marker).execute()
            print(f"\nPruned pre-cutover history (id ≤ {history_marker}); fresh baseline kept.")
        print("APPLIED. No DDL — no PostgREST reload needed.")
    else:
        print("\nDRY-RUN — nothing written. Re-run with --apply after sign-off.")


if __name__ == "__main__":
    main()
