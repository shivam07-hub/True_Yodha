# Ubiquitous Language

Domain glossary for Mirror, the Intelligence-as-a-Service platform for job seekers. Use these terms in code, tests, commits, docs, UI copy, and conversations. When you find drift in the codebase, prefer the canonical term over the alias, but do not refactor existing names purely to match this file.

## Skill Taxonomy

| Term | Definition | Aliases to avoid |
|------|------------|------------------|
| **Skill** | A Tax-L3 leaf in the Lightcast skill taxonomy, such as "PostgreSQL". | competency, capability |
| **Cluster** | A Tax-L2 grouping of related Skills. | sub-skill, l2_cluster |
| **Domain** | A Tax-L1 grouping of related Clusters. | category, l1_domain |
| **Taxonomy** | The Lightcast hierarchical skill graph: Domain to Cluster to Skill. | ontology, skill tree |
| **Signal** | One piece of CV evidence for a Skill: `mention`, `project`, `impact`, `leadership`, `certification`, or `years_experience`. | tag, hit, match |
| **Proficiency Level** | Integer 0-5 inferred from Signals. Titles: 0 None, 1 Scout, 2 Trailblazer, 3 Excavator, 4 Cartographer, 5 Legend. | grade, rank |
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
| **Baseline CV** | The user's most recent uploaded CV text. | original CV, master CV |
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

