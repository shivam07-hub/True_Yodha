# ADR-0004 sweep — tracking issue draft

> File this as a GitHub issue once `gh` CLI is wired or via the web UI. Keep the
> checked-in copy until the GitHub issue exists, then delete this file and link
> the issue from ADR-0004 instead.

**Title**: ADR-0004 sweep — migrate all LLM call sites to XP charge/refund

**Body**:

Tracking issue for the LLM call-site sweep mandated by [ADR-0004](./0004-llm-actions-cost-xp.md).

Phase 1 (CV upload) shipped in the same PR as the ADR. This issue tracks Phase 2 — bringing every other LLM-bearing call site under the same XP charge/refund discipline.

## Sites to migrate

- [ ] `services/cv_parser.parse_cv_text` from skill-edit re-tag (`services/cv_workflow.skill_edit_*`) — currently UNCHARGED. Should charge 50 XP per re-tag, refund on provider fail.
- [ ] `services/cv_parser.reparse_structured_only` inside `get_or_backfill_cv_structured` — lazy backfill silently calls LLM. Charge or short-circuit.
- [ ] `services/cv_workflow.ingest_cv_text` — parallel to `ingest_uploaded_cv`. Mirror 2-phase + XP gate.
- [ ] `routers/users.py:get_skill_advice` — already charges 20 XP via `SKILL_ADVICE_XP_COST`. Add **refund-on-fail**.
- [ ] `routers/jobs/analyse.py` — verify charge + refund parity.
- [ ] `services/jobs_workflow.compute_job_matches` from `/jobs/refresh` — already charges 50 XP. Add **refund-on-fail**.
- [ ] Initial post-upload match compute (`_trigger_initial_match_compute`) stays FREE as a welcome bonus — confirm and document.
- [ ] Diary milestone LLM summary (if any). Audit.
- [ ] Feedback Hub LLM summarisation (if any). Audit.

## Acceptance

Issue closes when every LLM call in `backend/app/` either:
1. Calls `xp_service.charge_or_raise` before the LLM call AND `xp_service.refund` on provider failure, OR
2. Is explicitly marked FREE in code (comment + ADR addendum) — e.g. one-time bonuses tied to other paid actions.

## Out of scope

- Cart-style preview modal — deferred until 1000 users (per ADR-0004 §5).
- XP ledger table — deferred until first dispute case forces it.
