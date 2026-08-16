# Ubiquitous Language

Domain glossary for Mirror, the Intelligence-as-a-Service platform for job seekers. Use these terms in code, tests, commits, docs, UI copy, and conversations. When you find drift in the codebase, prefer the canonical term over the alias, but do not refactor existing names purely to match this file.

## Skill Taxonomy

| Term | Definition | Aliases to avoid |
|------|------------|------------------|
| **Skill** | A Tax-L3 leaf in the Lightcast skill taxonomy, such as "PostgreSQL". | competency, capability |
| **Cluster** | A Tax-L2 grouping of related Skills. | sub-skill, l2_cluster |
| **Domain** | A Tax-L1 grouping of related Clusters. | category, l1_domain |
| **Taxonomy** | The Lightcast hierarchical skill graph: Domain to Cluster to Skill. | ontology, skill tree |
| **Practice Mode** | L3 contract for how Myro may practise a Skill: `levelled`, `scenario`, or `observed`. Independent of Domain and Cluster. | technical flag, soft flag |
| **Levelled Skill** | A Skill with an objective L1-L5 assessment contract; eligible for Learning, numeric gaps, demand ladders and matching. | hard skill, technical-only skill |
| **Scenario Skill** | A behavioral Skill tracked as hiring evidence for future case-study practice, never as a current numeric gap. | soft-skill ladder |
| **Signal** | One piece of CV evidence for a Skill: `mention`, `project`, `impact`, `leadership`, `certification`, or `years_experience`. | tag, hit, match |
| **Proficiency Level** | Integer 0-5 inferred from Signals. Titles: 0 None, 1 Scout, 2 Trailblazer, 3 Excavator, 4 Cartographer, 5 Legend. | grade, rank |
| **Assessed Level** | Integer 0-5 proven by a Learning assessment and stored in `skill_assessed_level`. It does not silently alter CV evidence, matching, or the Mirror Score. | CV level, matched level |
| **Single-Step Rule** | A user can only target one Proficiency Level above their current level for any Skill. | level skip, jump-grade |
| **Days-to-Close** | The fixed time budget to move a single Skill from level N to N+1. | level cost, upgrade time |
| **Session** | One bounded deep-work block in the Diary's DeepFocusTimer. | pomodoro |

## Scoring

| Term | Definition | Aliases to avoid |
|------|------------|------------------|
| **Mirror Score** | The user's headline platform score, 0-100. Mean of Domain Scores. | Truth Score, MYRO Score, total_score |
| **Domain Score** | A 0-100 score for one Domain. | l1 score |
| **Cluster Score** | A 0-1 score for one Cluster. | l2 score |
| **Rank Tier** | Internal-only label for a Mirror Score band. Never expose via API. | tier, level |
| **Gap Skill** | A recommended Skill upgrade fitted into a 7-day budget. | skill to upgrade, growth area |
| **Aspiration Skill** | A target Proficiency Level for a Skill, derived from jobs matching the user's target roles. | target skill |

## Job And Application

| Term | Definition | Aliases to avoid |
|------|------------|------------------|
| **Job** | A public posting, one row in `public.jobs`. | listing, opening |
| **Application** | A user's tracked engagement with a single Job. One row in `public.job_applications` per `(user, job)`. | tracked job |
| **Application Status** | The lifecycle state of an Application: `pending`, `applied`, `interviewing`, `offer`, `rejected`, `no_response`, `abandoned`. | status |
| **Application Path** | The per-Job coaching surface returned by `get_application_path`. | job path |
| **Skill Target** | A user-chosen Skill they commit to closing for a specific Job. Stored in `job_application_skill_targets`. | target skill, focus skill |
| **Primary Skill** | A Skill in `jobs.main_skills`; must-have for the Job. | main skill |
| **Side Skill** | A Skill in `jobs.side_skills`; nice-to-have for the Job. | secondary skill |

## 7-Day Plan

| Term | Definition | Aliases to avoid |
|------|------------|------------------|
| **Milestone** | One day's task on the rolling plan for a single Application. | task, todo |
| **Proof** | Free-text evidence the user enters when completing a Milestone. | completion note |
| **Impact** | Free-text outcome attached to a Proof. Distinct from Signal type `impact`. | result, outcome |
| **Milestone Confidence** | Float 0.0-1.0 on a Milestone row. | confidence |
| **Readiness Pct** | A 0-100 score of alignment with a specific Job. | fit score, alignment |
| **Readiness Tier** | User-facing band on Readiness Pct. | tier |

## CV Pipeline

| Term | Definition | Aliases to avoid |
|------|------------|------------------|
| **Baseline CV** | Immutable uploaded CV evidence used as an audit/reference snapshot. | Main CV, current CV |
| **Main CV** | The user's living, editable CV source. Explicit accepted edits autosave, re-tag and re-score it. | Baseline CV, CV Variant |
| **CV Variant** | A per-Job tailored CV. | tailored CV, job CV |
| **Deterministic CV** | Programmatically built CV text on a CV Variant. | template CV |
| **Polished CV** | LLM-rewritten Deterministic CV after passing the Quality Gate. | AI CV, generated CV |
| **AI Polish** | Optional LLM rewrite step, rate-limited to 3 successful polishes per user per 24h. | LLM rewrite |
| **Quality Gate** | Rule-based filter applied before storing a Polished CV. | validation |
| **CV Confidence Label** | One of `starter`, `proof_backed`, or `strong_evidence`. | confidence |
| **Snapshot Hash** | Content-addressable key for a CV Variant. | hash, key |

## Follow-Up

| Term | Definition | Aliases to avoid |
|------|------------|------------------|
| **Follow-up Playbook** | Scripted next-action recommendation keyed off Application Status and days since applied. | nudge, suggestion |

## UX Surfaces

| Term | Definition | Aliases to avoid |
|------|------------|------------------|
| **Skill Timer** | A per-Skill UI card showing level progress and session progress. | skill card, skill widget |
| **Session Footer** | Persistent bottom-of-screen indicator while a Session is running. | active timer bar |
| **Honesty Principle** | Invariant: AI Polish must not exceed the user's actual Proficiency Level. | truthfulness rule |
| **Jobs Tracking Dashboard** | User-facing surface listing Applications with status, readiness, and last activity. | tracker |
| **Chrome Extension** | Manifest V3 extension at `/Chrome_extension/` that captures a JobPosting page into Mirror. | scraper |

## Pre-flight Order

The vocabulary of the Myro Search pre-flight, shared by the gate and the market
bottom-sheet. Use these exact words in code AND in copy — the surface's whole
premise is that the user can tell one kind of statement from another, and two
words for one thing is how that stops being true.

| Term | Definition | Aliases to avoid |
|------|------------|------------------|
| **Order** | The whole targeting record Myro runs on. One per user, `preflight_orders`. | brief, manifest, draft, targeting |
| **Line** | One atomic statement in the Order. Everything is a Line: a role, the location, a won't-take, a lean. | row, chip, field, filter |
| **Guess** | A Line Myro proposed (from memory notes or the CV) that the user has not answered yet. | suggestion, prefill, inference |
| **Source** | Where a Line came from: `you said this` · `Myro inferred` · `from your CV` · `your words, just now`. Always rendered; never inferred by the reader. | provenance chip, origin (that is a separate field) |
| **Answered** | The user said yes, said no, or reworded it. A reword counts as yes. | confirmed, accepted |
| **Dropped** | Said no to, **or left unanswered at run time**. Never sent to ops. | ignored, skipped |
| **Brief** | The assembled prose on the review screen, built from kept Lines only. | summary, sentence, order (the Order is the record) |

Copy rules on these surfaces: sentence case, no exclamation marks, no emoji,
second person; lowercase button labels for inline answers (`yes` / `no` /
`reword`), Title-case for primary CTAs (`Run · Free`).

## Public Vocab Lock (PR2, 2026-05-26)

User-facing labels for four surfaces. Code identifiers (file names, components, hooks, CSS classes, DB columns, routes, GA4 event keys) are **frozen** at their old names — only visible copy moved. Backend service `forge_service.py`, table `forge_sessions`, column `user_profiles.ninja_name`, routes `/forge` / `/intel` (alias for `/market`) / `/home` / `/profile/{ninja_name}` are durable contracts and intentionally retain the old vocabulary.

| Surface | User-facing label | Old aliases to avoid in copy |
|---------|------------------|------------------------------|
| **Practice** | A bounded deep-work session block, the timer page, and the verb for working on a Skill (`/forge` route). Loop-bar stage label. Sidebar widget. | Forge (UI), Forge XP, Forge session, Forge claim, Log to Forge, Skills to forge, Tap to forge, Forging, Forge a skill |
| **Live Job Data** | The market intelligence surface — heatmap + live job demand (`/market` route). View-triad "intel" key. Newsletter taxonomy. CV-builder JD lens. | Intel (UI), Job Intelligence (UI), Hiring Intel, Browse Intel, View intel |
| **Tackle Today** | The /home page concept and the eyebrow / nav-desc / "in {page}" descriptor. Renames the dashboard from a control-room metaphor to an action-oriented daily surface. | Mission Control (UI), Today's mission control |
| **Public Name** | The user's vanity slug shown as their public handle. Onboarding step label, Settings field, share-sheet handle. Slug pattern `^[a-z0-9-]{3,32}$` unchanged. | Ninja Name (UI), ninja name placeholder |

Carve-outs that intentionally keep their old word:
- The dark theme aesthetic is still `data-accent="signal"` in CSS; the parenthetical "(Signal)" / "(Forge)" was stripped from `aria-label` so the sun/moon icon carries the affordance. Theme keys remain internal-only.
- The phrase **"Intelligence"** as a standalone word survives (the "Intelligence-as-a-Service" tagline, "Career Intelligence" eyebrow on `/about` and `/market`, "Market intelligence" nav desc). Only the bare word "Intel" and the compound "Job Intelligence" moved.
- Comments, ADRs, session-history, and beta-testing docs are historical record and use the old vocabulary as it was at write-time.

## Architecture

| Term | Definition | Aliases to avoid |
|------|------------|------------------|
| **Repository** | A module that owns Supabase reads/writes for one table family and exposes typed Python functions. | dao, store |
| **Job Feed** | The ingestion contract between the external `firecrawl_Supabase` crawler and Mirror's `public.jobs` table. | scraper import, jobs dump |
| **Provider Chain** | Ordered list of LLM endpoints tried in fallback order: OpenRouter, Groq, Gemini, OpenRouter free. | LLM stack, model chain |
| **God Node** | A function or symbol with very high in-degree, such as `get_supabase_admin`. | god object |

## Relationships

- A User uploads one or more Baseline CVs; only the latest is referenced for scoring and CV Variants.
- A Baseline CV produces Signals; Signals aggregate by Skill into a Proficiency Level.
- A Learning clear produces an Assessed Level. Only an explicit user action may promote that proof into the Main CV.
- Proficiency Levels compute one Mirror Score with Domain Scores and Cluster Scores.
- A User plus Job creates an Application.
- An Application has Skill Targets and Milestones.
- A Milestone can produce Proof, Impact, and Milestone Confidence.
- An Application has CV Variants. Each Variant always has a Deterministic CV and may have a Polished CV.
- Aspiration Skills are system-derived from jobs matching target roles. Skill Targets are user-chosen on a single Job.

## Flagged Ambiguities

1. **Mirror Score vs Truth Score vs MYRO Score vs `total_score`.** Canonical: Mirror Score. UI branding may show MYRO SCORE.
2. **Job Path vs Application Path.** The module is `job_path`; the domain concept is Application Path.
3. **Tier is overloaded.** Use Rank Tier or Readiness Tier.
4. **Confidence is overloaded.** Use CV Confidence Label or Milestone Confidence.
5. **Impact is overloaded.** Use Signal type `impact` or Milestone Impact.
6. **Skill Target vs Aspiration Skill.** Skill Target is user-chosen per Job; Aspiration Skill is system-derived.
