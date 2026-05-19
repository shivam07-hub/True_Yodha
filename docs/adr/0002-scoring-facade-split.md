# ADR 0002 — Mirror Score: facade split over monolithic orchestrator

**Status:** Accepted
**Date:** 2026-05-19
**Context:** OQ4 — single source of truth for the Mirror Score

## Decision

The Mirror Score engine is exposed through three typed facades rather than one
multi-mode function. The canonical math + persistence live in private internals
behind those facades.

Public surface in `app.services.scoring`:

- `record_cv_score(scores_repo, user_id, skills_detected)` — CV ingest path.
  Infers levels from raw signals, writes `user_skills`, persists score.
- `recompute_score(scores_repo, user_id)` — recompute path. Reads
  `user_skills` + `target_roles`, writes only `mirror_scores`.
- `project_score(scores_repo, skill_level_map, ...)` — pure math, no writes.
  Used by tests and future what-if previews.

Internals (private):

- `_score_math(...)` — canonical formula pipeline
- `_persist_score(...)` — single writer to `mirror_scores` + `mirror_score_history`
- `_build_user_skill_rows(...)` — skill row construction

## Why this preserves OQ4

OQ4 protects two invariants:

1. **One canonical algorithm.** Every caller produces an identical number from
   identical inputs. The math runs in exactly one private helper (`_score_math`).
2. **One persistence path.** No router or service writes to `mirror_scores`
   directly. Writes go through `_persist_score`.

The single source of truth is the *engine* (math + persistence), not the
public function signature. SQL has one canonical query planner but does not
expose it as `run_query(mode=...)`; it exposes `SELECT`, `INSERT`, `UPDATE`.
Same pattern here.

## Why the monolithic shape was failing

The previous interface was `compute_and_persist_score(scores_repo, user_id,
skills_detected=None, aspiration_skills=None, skill_level_map=None,
include_market_signals=True, require_skills_assessed=False, persist=True)`.
Four modal flags. Two contradictory calling conventions hidden behind one name:

- CV upload: pass `skills_detected`, set `include_market_signals=False`,
  set `require_skills_assessed=True`.
- Recompute: pass `skill_level_map`, fetch `aspiration_skills` upstream,
  pass it through.

Every recompute caller (`routers/users.py`, `routers/scores.py`) repeated a
three-line dance: `get_recompute_inputs → fetch_aspiration_skills →
compute_and_persist_score`. Each new auto-trigger (diary submit, tracker
outcome → skill bump) would duplicate that dance or risk silent flag errors.

## Consequences

**Positive:**
- Each caller's call site is one line, expressing intent.
- New auto-triggers (diary, tracker outcome) cannot misconfigure flags.
- The math is testable in isolation through `project_score`; persistence is
  testable through the facades. The modal-flag combinatorial surface is gone.
- `services/scoring/aspirations.py` and `services/scoring/market.py` have their
  own homes; persistence is no longer a grab-bag module.

**Trade-offs:**
- Three public symbols instead of one. Callers must pick the right facade —
  but the name *is* the intent, so picking is mechanical.
- A future facade may be needed (e.g. `apply_outcome_event(...)` if tracker
  outcomes become event-shaped rather than skill-mutation-shaped). The seam
  is now wide enough for that without re-touching the engine.

## Do not re-suggest

Future architecture reviews may notice three facades sharing internals and
suggest collapsing them into one parameterised function. **Do not.** That
direction failed once; this ADR exists to keep it failed.

If a new caller needs a fourth intent (e.g. event-driven recompute with an
event payload), add a fourth facade. Do not widen `recompute_score` or
`record_cv_score`'s signature to accept a mode flag.

## Removed

- `compute_and_persist_score` — replaced by the three facades.
- `services/scoring_engine.py` shim — direct imports from
  `app.services.scoring` only.
- `persist_user_skills`, `persist_score` — privatised inside
  `orchestrator.py`.
- `persist=False` flag — superseded by `project_score`.
- `include_market_signals` flag at the public surface — baked into facade
  defaults (`record_cv_score` skips market lookup; `recompute_score` uses it).
- `require_skills_assessed` flag — absorbed into `record_cv_score`'s guarantee.
