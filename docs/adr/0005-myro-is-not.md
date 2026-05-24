# ADR 0005 — What Myro is not

**Status:** Accepted
**Date:** 2026-05-25
**Context:** Beta-3 surfaced users testing Myro against mental models from adjacent products (Canva, Rezi, Naukri, LinkedIn, ChatGPT). Several beta reports asked for features that would break the locked Brooks stake (*"Myro is the home for every version of your CV — scored against live jobs"*). Without an explicit NOT-list, every product question reopens the stake.

## Decision

The product takes positions, not menus. This ADR enumerates the boundary — what Myro deliberately is NOT.

### The list

1. **Not a job board.**
   Myro does not own job postings. We pull live job data from upstream scrapers (see ADR-0001) and surface matches; we do not publish jobs ourselves. Companies post jobs elsewhere.

2. **Not a feed.**
   Myro is not engagement-loop entertainment. No infinite scroll, no "people you may know", no algorithmic news. Sessions are short, purposeful, intent-driven.

3. **Not a coaching service.**
   Myro is software. No human coaches, no review queues, no white-glove tier. The product gets out of the way of the user's own work.

4. **Not a generic AI rewriter.**
   "Polish my CV with AI" is a feature inside Myro (XP-gated, per ADR-0004) — it is NOT the product. Generic rewriters generate text; Myro tells you why your CV is or isn't ready for a specific job.

5. **Not a CV aesthetics / template tool.**
   We do not compete with Canva, Rezi, or Enhancv on resume design, typography, or template libraries. The CV's appearance is the user's choice; Myro's job is the signal underneath.

6. **Not a freelance / contracting marketplace.**
   No bidding, no escrow, no hour tracking. Myro is for people seeking jobs, not gigs.

7. **Not a salary calculator.**
   Salary data is downstream noise relative to the scarce resource (a tailored, scored CV). Deferred indefinitely; revisit when v2 explicit demand arrives.

8. **Not a public CV builder from scratch.**
   See "carve-out" below — this is the only exception that gets a v1 lane.

## Carve-out — Onboarding Baseline Generator

Beta-3 user u6 (and others) asked: *"can I build a CV from scratch here?"* The honest read is two questions:

- **Q1 — Should Myro compete with Canva on resume aesthetics?** No (item 5 above).
- **Q2 — Should Myro have a path for a user with no CV to enter the product?** Yes — but the artifact it produces is a *baseline*, not a designed CV.

The carve-out:

- **Surface:** A guided 5-question intake during onboarding when the user has no CV to upload. Generates a plain-text baseline CV via the existing LLM provider chain (OpenRouter → Groq → Gemini).
- **Output:** A `cv_versions` row with `kind='baseline_upload'`. From there, the full Myro pipeline (skills parsing → scoring → matching → tailoring) runs unchanged.
- **Audience:** L0 users with no prior CV. Hidden for any user whose profile already has a `cv_versions` row.
- **Tone:** Framed as "Get your baseline ready in 2 minutes", NOT as "Build a resume". The output is explicitly described as a starting point that Myro will help sharpen against jobs.
- **Secondary value:** The intake doubles as a guided navigation tour — first-time users who haven't seen the product yet get the Myro vocabulary (Master / tailored / scored, Skills, Live Job Data, Practice, Tackle Today, Public Name) introduced in context.
- **Quality bar:** v1 produces simple structured CVs. We do not invest in template variety, design polish, or visual styling. Output reads as plain, honest, well-organized text. If a user wants more, they take the generated baseline elsewhere to format it.
- **Lifetime:** Once the user has a baseline (uploaded or generated), the generator is hidden forever. Skill edits and tailored versions go through the existing CV Builder surface.

This carve-out preserves the Brooks stake — the artifact the generator produces IS a baseline CV that Myro then scores and tailors. The scarce resource (the CV-version hub) is unchanged; we have simply added a path for users without a starting point.

## Consequences

- Every product decision can now be checked against this list before discussion. "Should we add salary?" → item 7 says no, revisit only on v2 explicit demand.
- The Onboarding Baseline Generator graduates from question to backlog item. Implementation queue: ships after vocab + theme + identity PRs (per grill ordering γ).
- Marketing copy on `/about` and elsewhere may reference the carve-out as a feature ("Don't have a CV yet? Get one in 2 minutes."), but the locked stake ("Home for every version of your CV — scored against live jobs") stays primary.
- When external comparisons arise ("how is Myro different from X?"), this list is the answer.

## Parked questions

- **Salary signal as derived field (not calculator).** If beta-4 surfaces a demand-side need for "what jobs in this domain pay", we can compute aggregate ranges from the existing live job data without becoming a calculator. Revisit only on demand.
- **Coaching marketplace as v3 product line.** Out of scope today; not a permanent NO. Locked as "not in v1/v2" only.
- **Team / enterprise tier.** Not addressed by this ADR. Separate decision when applicable.
