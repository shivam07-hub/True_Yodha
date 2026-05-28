# Myro Ubiquitous Language
### Shared vocabulary for code, conversations, PRs, and product copy · v1.0 · 2026-05-09

This document fixes the names of the things we build. Code identifiers, PR titles,
Slack threads, design notes, and customer-facing copy all use these terms.
When we use the same words, we save the cost of translation between contexts.

> Inspired by Eric Evans' Domain-Driven Design: a "ubiquitous language" is a
> vocabulary shared between domain experts and engineers, present in code as
> well as in speech.

When a term in this document changes, the codebase changes too. Renames are
tracked as PRs that update both this file and every symbol it names.

---

## Page anatomy — Skill Intelligence (`/skills`)

| Term | Definition | Code symbol |
|---|---|---|
| **Page Hero** | Title + Myro Score block at the top of the page | `<PageHero>` |
| **View Switcher** | The Tree / Radar toggle | `<ViewSwitcher>` (button group) |
| **Domain Strip** | Horizontal grid of domain cards (Business, IT, Analysis, …) | `<DomainStrip>` |
| **Domain Card** | One card inside the Domain Strip | `<DomainCard>` |
| **Constellation** | The organic skill graph (nodes + edges canvas) | `<Constellation>` (existing: `OrganicSkillGraph`) |
| **Radar** | The polar-coordinate domain score visualisation | `<Radar>` (existing: `DomainRadar`) |
| **Domain Inspector** | The drill-down panel for a selected domain | `<DomainInspector>` |
| **Skill Tile** | One skill card inside the Inspector | `<SkillTile>` |
| **Selected Domain** | The currently active selection (single source of truth) | `selectedDomain: string \| null` |

> **Note on "Inspector":** we deliberately moved away from "Drill-down". "Drill-down"
> is action language ("I will drill down"), which is fine in conversation but
> awkward as a noun in code (`DrillDown` reads like a verb). "Inspector" is a
> structural noun borrowed from devtools — users already understand it as
> "the panel that shows me details about the thing I selected."

---

## State vocabulary

| Term | Means |
|---|---|
| **selected** | A user-driven persistent choice (e.g. `selectedDomain`) |
| **active** | Currently in focus due to interaction (hover, keyboard) — transient |
| **hovered** | Pointer is over the element |
| **focused** | Element has keyboard focus |
| **disabled** | Element cannot be interacted with |
| **loading** | Async operation in flight |
| **empty** | Component has no data to show |

> **Rule:** `selected` survives blur. `active` does not. Pick the right one.
> We previously used `activeDomain` for what is structurally a `selectedDomain`.
> Going forward, prefer `selected*` for sticky state.

---

## Interaction vocabulary

| Term | Means |
|---|---|
| **Open / Close** | A panel, modal, drawer, or inspector that has a clear in/out state |
| **Expand / Collapse** | An accordion-like region whose content grows/shrinks in flow |
| **Show / Hide** | Visibility toggle without layout reflow (e.g. tooltips) |
| **Drill into** | Verb form — the user's act of going deeper. Never use as a noun. |
| **Filter** | Reduce a set by criteria (active filter ≠ active selection) |
| **Highlight** | Visually emphasise without changing the dataset |

---

## Domain (business) vocabulary

| Term | Means |
|---|---|
| **Myro Score** | The 0–100 composite score across 10 domains |
| **Domain** | A top-level skill area (e.g. Analysis, Engineering, Sales) |
| **Cluster** | Sub-grouping inside a domain |
| **Skill** | An atomic capability with a level (L1–L5) |
| **Level (L1–L5)** | Proficiency band: L1 Scout · L2 Trailblazer · L3 Practitioner · L4 Expert · L5 Master |
| **Forge Session** | One unit of skill practice; advances level after N sessions |
| **Gap** | A skill the user lacks but a target job requires |
| **Proof** | Evidence text from CV that supports a claimed skill |
| **Matched Skills** | Skills the user has at level ≥ 1, regardless of whether they meet the job's required level. Rendered as "Skills you already match". |
| **Skills to Build** | Skills the user has zero proficiency in (`user_level === 0`) for a given job. The growth list — moves the user from L0 → L1+. Rendered as "Skills to build". |
| **Level-up Skills** | Skills where `0 < user_level < required_level` — already on Matched Skills, never on Skills to Build (they aren't "new"). |
| **Cart** | Ephemeral skill selection during diary entry (Zustand, not DB) |
| **XP** | Permanent currency; never resets; earned via forge sessions and diary entries |
| **CV** | Curriculum vitae; the user's source-of-truth document |
| **Intel** | Market intelligence: jobs, market signals, fit analysis |
| **Onboarding Journey Strip** | The 6-step progress ribbon (Drop in → We read it → Pick a target → See gaps → Tailor → Download) shown to first-time users during signup + onboarding so they know where they are in the 0→10 minute loop. Code symbol: `<OnboardingJourneyStrip currentStep={1..6} />`. Aliases to avoid: timeline, loop, progress bar. |

---

## Anti-patterns — names we do not use

| ❌ Don't say | ✅ Say instead | Why |
|---|---|---|
| Drill-down (noun) | Inspector | "Drill-down" is a verb form pretending to be a noun |
| Stats strip | Domain Strip | "Stats" is generic; "Domain" names what it actually shows |
| Active domain (sticky) | Selected domain | `active` should mean transient; we want sticky semantics |
| Skill graph | Constellation | "Graph" overloads with charts and graphs in general; "Constellation" is the product metaphor |
| Skill gaps to close (right panel) | Skills to Build | "Gaps to close" lumps together "you don't have it" and "you have it but need to level up". Two intents → one name. The level-up case lives on Matched Skills; only true L0 skills go here. |
| Missing skills | Skills to Build | "Missing" reads like an absence to fix; "to Build" reads like an opportunity. Same data, better framing. |
| Toggle | View Switcher (when picking a view) | "Toggle" is a binary on/off; switcher implies discrete choice |
| Drill | Drill into (verb only) | Reserve as verb to keep "Inspector" as the noun |

---

## How to extend this document

1. When you introduce a new noun in code, check this file first. If a name
   exists, use it. If not, propose one in the PR.
2. When you find an existing symbol that doesn't match this language, file a
   rename (see the rename options in the relevant tracking issue).
3. New terms enter via a PR that edits this file. The PR description should
   answer: "what is this thing, and why is the proposed name better than the
   alternatives we considered?"
