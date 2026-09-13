# Myro Spends Frontier Quality On The Flagship, On The XP Rail

**Status:** Accepted
**Date:** 2026-06-05
**Related:** ADR-0004 (LLM actions cost XP, no time cooldowns), MYRO_TUTOR_DESIGN.md

## Decision

Route models by **task-criticality, not flat cost**, over the existing `llm_provider` ladder +
budget semaphore (extend the `get_cv_upload_provider` pattern into a per-task tier selector):

| Task | Tier |
|---|---|
| Recruiter Read + XYZ Rewrite (flagship) | **Frontier model** |
| Skill tutoring (`/forge`) | Mid-tier |
| Intent classifier, memory consolidation | Cheapest free tier |
| Corpus embeddings | Cheap embedding model, offline |

**Prompt-cache** the static behavioral spec + retrieved shelf chunks; only the CV/JD is fresh
tokens per turn.

**Cost rail — conforms to ADR-0004 (no time cooldowns):** Recruiter Read / Rewrite are
LLM-bearing actions and therefore **cost XP**, **floored at 0 on the core CV flow** (never blocks
a broke first-timer), **0 XP on cache hits**, **refunded on provider failure**, with the standard
**recovery CTA** on empty. The **+3000 welcome grant** funds the first-CV wedge. Frontier-model
abuse control is the XP cost + floor-0 + caching.

## Considered Options

- **Cheap-tier on the flagship:** rejected — the Recruiter Read is the felt moment of the wedge;
  generic output = no moat = day-1 churn. Per-CV cost is tiny; retention is everything.
- **Per-day rate limit for abuse control:** **rejected — violates ADR-0004's "no time-based
  cooldowns."** Reintroduces the exact two-currency mental model ADR-0004 killed. The XP rail +
  floor-0 + caching bounds spend without a clock.
- **Frontier on flagship, tiered elsewhere, XP rail with floor-0:** accepted — spends where it is
  felt, conserves elsewhere, and keeps a single currency.
