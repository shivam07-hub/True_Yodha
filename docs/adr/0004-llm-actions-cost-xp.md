# ADR-0004 — All LLM-bearing user actions cost XP

- **Status**: Accepted
- **Date**: 2026-05-23
- **Supersedes**: implicit time-based cooldown in `services/rate_limit.py` (`_COOLDOWN_DAYS = 3`) for CV uploads
- **Related**: XP1 (XP permanent), IH2 (follow-cost economy), XP7 (cart ephemeral), SE17 (poll-based async completion)

## Context

Myro's product promise is "stack a tailored CV per job" — users are expected to upload, branch, re-upload often. The 3-day baseline-upload cooldown enforced via `assert_not_rate_limited` directly fights that promise: a user who uploads a wrong file, or wants to swap CVs, is locked out for ~72h with a confusing "next analysis in 71h 23m" error.

Meanwhile, XP is already the canonical scarcity rail across the product:

- Welcome grant: +3000 XP (was post-CV; now signup, see decision below)
- Forge session: +50 XP
- Diary entry: +30 XP
- LinkedIn profile: +50 XP
- Follow company: -10 XP (floor -30)
- Skill advice: -20 XP
- Match refresh: -50 XP

Mixing time cooldowns with an XP economy creates two competing mental models. Users cannot reason about "why is this blocked?" without learning both. Per Brooks (Design of Design), conceptual integrity beats local optimization — pick one currency.

## Decision

**Every LLM-bearing user action costs XP. No time-based cooldowns.**

Rules:

1. **Charge on LLM call, not on intent.** The user is debited only when the provider chain is actually invoked. Hash-cached re-runs (CV with identical content hash, identical prompt cache hits) cost 0 XP.
2. **Refund on provider failure.** If the LLM provider chain fails (503 from `get_llm_provider()`), the charge is reversed atomically and the user is told: "Our analysis service was down — your N XP has been refunded."
3. **Floor 0 for core flows, -30 for cosmetic flows.** CV upload, scoring, parsing, polishing, recompute, skill advice → floor 0. Follow company → floor -30 (already shipped).
4. **No preview modal until 1000 users.** Until then we optimise for flow: deduct silently with a toast in the result UI ("Used 200 XP — balance 2,800"). Revisit cart-style preview post-1000.
5. **Welcome XP pre-grants at signup**, not on first CV. Removes the chicken-and-egg where the first paid action also funds it. Uniform rule = uniform mental model.
6. **Out-of-XP states surface a recovery CTA.** `"Out of XP — earn 30 XP in 5min via diary"` on every gated surface. Never a dead end.

### Pricing v1 (reversible)

| Action | XP cost | Reason |
|--------|---------|--------|
| CV upload (LLM parse) | **200** | ~15 re-uploads from welcome grant; ~4 forge sessions to refill one upload |
| CV polish per bullet | 50 | already roughly aligned |
| Skill advice | 20 | unchanged |
| Match refresh | 50 | unchanged |
| Follow company | 10 | unchanged (floor -30) |

Pricing is intentionally cheap until usage data tells us otherwise — Brooks "progressive truthfulness." Retune via `xp_policy.py` constants, not code rewrites.

## Migration plan (this ADR closes when all items shipped)

### Phase 1 — CV upload (THIS PR)
- [x] Drop `assert_not_rate_limited` from `ingest_uploaded_cv` and `ingest_cv_text`
- [x] Welcome XP grant moves from `cv_workflow` to `ensure_user_provisioned` (signup-time)
- [x] New `xp_service.charge_or_raise(user_id, amount, action, floor=0)` returns ledger id
- [x] New `xp_service.refund(user_id, amount, action, reason)` for atomic reversal
- [x] CV upload split into 2 phases — synchronous persist (free) + async LLM (charged, refundable)
- [x] Frontend polls `GET /cv/upload/status/{job_id}` (mirrors SE17 recompute pattern)
- [x] Out-of-XP empty state: "Earn 30 XP in 5min via diary →"
- [x] Refund toast: "LLM service was down. Your 200 XP has been refunded."

### Phase 2 — LLM call-site sweep (separate ADR-tracking issue)
Every site below either (a) already charges XP and is consistent, or (b) needs migration to `charge_or_raise` + `refund`. Tracked separately to keep PR scope honest.

- `services/cv_parser.parse_cv_text` — used by CV upload (Phase 1 covered), skill-edit re-tag, structured backfill. Skill-edit re-tag currently UNCHARGED.
- `services/jobs_workflow.compute_job_matches` — match refresh charges 50 XP via `MATCH_REFRESH_XP_COST`. Initial match compute is FREE (post-upload bonus); keep that.
- `services/cv_parser.reparse_structured_only` — backfill path inside `get_or_backfill_cv_structured`. Triggered lazily, may LLM-call without warning. **Needs charge.**
- `routers/users.py:get_skill_advice` — already charges 20 XP via `SKILL_ADVICE_XP_COST`. Add refund-on-fail.
- `routers/jobs/analyse.py` — LLM-driven; verify charge + refund parity.
- `services/cv_workflow.ingest_cv_text` — parallel path to upload; mirror the 2-phase + XP treatment.

## Consequences

**Positive**
- Single mental model: XP gates everything. Users learn it once.
- Mobile cellular socket TTL no longer a product killer (sync HTTP fast → async LLM long).
- Cost protection survives via XP + provider quotas, not arbitrary time windows.
- Refunds prevent users paying for our outages.

**Negative / risks**
- Phase 1 ships partial coverage (only CV upload). Other LLM sites still uncharged. Mitigation: ADR is loud about it; tracking issue lives until closed.
- Welcome XP pre-grant at signup creates a one-time backfill question for existing pre-pre-grant users. Mitigation: idempotency via `welcome_xp_granted` already prevents double-grant; backfill SQL grants to any signup-confirmed user with `welcome_xp_granted = FALSE`.
- 0-XP CV lockout for spam-uploaders. Mitigation: empty-state CTA points to diary (+30 XP in 5min).

## Open questions parked

- Cart-style preview ("This costs 200 XP. Continue?") — revisit post-1000 users.
- XP ledger table (`xp_ledger`) for full audit history — currently we mutate `user_profiles.xp_balance` directly with log lines. Ledger lands when first compliance / dispute case forces it.
