# Spec - Myro Career Growth Command System

**Date:** 2026-06-13
**Status:** Phase 1 implemented on `Develop`; deployment and tracker import pending
**Owner:** Shivam
**Branch policy:** Work on `Develop`. Never merge directly to `main`.

---

## Decision
Myro will build one private, human-first command system connecting real job-seeker needs, Myro's first-party evidence, useful public content, review-gated distribution, measurement, and product activation.

The system will replace `Myro Newsletter/growth-agent/distribution-tracker.html` as the operational source of truth while preserving its useful cockpit model and JSON export/import as backup.

This specification extends the May 17 Growth Mission Control design. Where that design treats the newsletter as the main acquisition surface, this design generalizes the engine to newsletters, guides, career pathways, company intelligence, data pages, and free tools.

## First Principle
Myro is not building a content factory or social scheduler. It is building a career-help delivery system.

The governing question is:

> What does this person need to understand or do next, what evidence can Myro offer, and how quickly can we deliver it where they are already asking?

```text
Need signal
  -> evidence and editorial judgement
  -> canonical article, tool, or data page
  -> channel-native explanation
  -> useful next action
  -> measured product activation
  -> learning for the next response
```

Content volume, impressions, and follower counts are diagnostic metrics. They are not the north star.

## Goals
- Help job seekers with timely, evidence-backed and understandable guidance.
- Turn aggregate Myro jobs, skills, companies, locations, and user-question data into differentiated public value without exposing personal data.
- Operate one system across SEO, newsletters, social media, communities, email, and product CTAs.
- Preserve human review wherever context, sensitivity, or community norms matter.
- Attribute traffic through signup and activation so Myro learns what genuinely helps.
- Support three articles and one tool or data page weekly, with one newsletter assembled from the strongest insight.
- Keep Myro product-first. Advertising is a later, selective monetization layer.

## Non-Goals
- No mass AI page generation or separate exact-match domains.
- No automated Reddit, WhatsApp-group, LinkedIn-comment, or trust-sensitive community posting in early releases.
- No scraped personal contacts, fake engagement, fear-based copy, or guaranteed career claims.
- No private CV, skill, application, or identity data in growth reporting.
- No social API project before manual workflow and attribution prove that a channel creates activated users.
- No ads in authenticated product flows, CV work, job tracking, or interview practice.

## Approaches Considered
### A. Extend the standalone tracker
Fast initially, but state remains browser-local, campaign definitions duplicate, and product activation cannot be connected reliably.

### B. Separate editorial, social, SEO, and analytics tools
Each tool stays smaller, but operators must reconcile identifiers, URLs, statuses, and metrics manually. The user journey disappears between systems.

### C. One command system with bounded modules
Recommended and approved. A canonical content asset anchors each campaign, message, publication, metric, and activation event. Modules remain independently testable behind stable identifiers.

## Public Architecture
All public value remains on `himyro.com`:

| Surface | Purpose |
|---|---|
| `/newsletter/` | Timely hiring-market intelligence and synthesis |
| `/guides/` | Evergreen CV, interview, application, and job-search guidance |
| `/careers/` | Role pathways, skill requirements, and transition plans |
| `/companies/` | Live company hiring, location, role, and skill intelligence |
| `/tools/` | Utilities that answer a narrow career question |
| Myro account | Personalized score, matching, CV work, tracking, and practice |

The canonical public asset is the durable answer. Social posts, replies, emails, and newsletter sections are channel-specific derivatives pointing to the right next step.

## Core Modules
### 1. Need Radar
Candidate needs come from approved signal sources:

- aggregate Myro search, CTA, and product-flow behavior,
- beta feedback, support, and recurring user questions,
- Myro's jobs, companies, locations, titles, and skills dataset,
- Search Console query and page-opportunity data,
- verifiable public hiring events,
- manually selected community questions.

Each signal becomes a `need brief`, not an automatic article. The brief records audience, question, urgency, evidence, confidence, sensitivity, recommended format, and useful next action.

The system must never infer personal vulnerability or target an individual with pressure. Community signals remain contextual research until a human approves a response.

### 2. Editorial Planner
Each approved asset has one primary job:

- explain a changing market,
- teach a repeatable skill,
- help make a career decision,
- answer a company or role question, or
- provide a useful diagnostic.

The newsletter collaboration gate remains: Shivam and the agent agree on angle, heading, and dashboard or images before drafting a full article.

Every asset records source evidence, freshness date, audience, primary next action, owner, review state, and canonical URL.

### 3. Distribution Studio
The studio creates channel-native derivatives from an approved asset. Each message stores channel, format, audience, intent, draft, approved final copy, UTM URL, review state, reviewer, planned time, sensitivity, and automation level.

The current tracker behaviors remain: filters, statuses, draft editing, final-copy capture, composer links, live URLs, and manual metrics. They move into a private Supabase-backed Myro surface.

### 4. Publication Registry
A publication is immutable evidence of what actually went live. It is separate from the editable message and records actual time, live URL, external ID, outcome, and failure details. This supports variants, reposts, deleted posts, failed sends, and platform suspensions without rewriting history.

### 5. Attribution And Activation
Every public link uses:

```text
utm_source=<channel>
utm_medium=<surface>
utm_campaign=<campaign-slug>
utm_content=<message-or-publication-id>
```

Myro captures first eligible touch and latest eligible touch before signup, carries them through password, magic-link, and OAuth flows, and attaches them after authentication. Referral attribution remains separate and is never overwritten.

```text
impression -> click -> engaged visit -> subscriber -> signup
  -> onboarding or CV upload -> useful product action -> return/share
```

Activated users are the primary outcome. Useful actions may include CV upload, job save, or interview-practice start. Definitions are versioned so historical reports do not silently change.

### 6. Learning Loop
The system produces decisions:

- expand channels that create activated users,
- rewrite channels that create clicks without signups,
- repair landing or onboarding fit when signups do not activate,
- refresh pages with impressions but weak click-through,
- retire or redirect stale content,
- pause suspended, untraceable, or consistently low-quality channels.

Weekly reviews record the decision and rationale so weak tactics are not repeatedly rediscovered.

## Humanization Contract
Every public derivative must pass five checks:

1. **Need first:** answer the person's question before mentioning Myro.
2. **Evidence visible:** distinguish observed data, sourced facts, and advice.
3. **Agency preserved:** offer options and trade-offs, not shame or commands.
4. **Context respected:** match the channel and emotional situation, especially around layoffs and rejection.
5. **Next step proportional:** ask only for the smallest useful next action.

The generator may adapt tone and structure. It may not invent evidence, inflate urgency, or imply private access to a person or platform.

## Timeliness Model
| Class | Example | Service target |
|---|---|---|
| Urgent | Layoff, hiring freeze, major hiring announcement | Brief within 60 minutes; reviewed response within 4 hours |
| Active | High-fit community question or rising search query | Draft the same working day |
| Scheduled | Weekly dataset insight, CV guide, interview guide | Next editorial cycle |
| Evergreen | Stable reference, template, or calculator | Build when compounding value justifies the time |

Speed never bypasses verification or sensitive-content review.

## Command Center Experience
The private, server-authorized web surface is `/admin/growth`. It is mobile-responsive but optimized for desktop operations.

- **Today:** urgent needs, overdue reviews, scheduled publications, anomalies.
- **Content:** need briefs and canonical assets.
- **Distribution:** drafts, approvals, publications, and channel status.
- **Performance:** search, campaign, subscriber, signup, and activation results.
- **Signals:** observations, freshness, confidence, and triage decisions.

The default view answers:

1. Who needs help now?
2. What useful asset or response is ready?
3. What requires Shivam's judgement?
4. What produced meaningful progress?

Browser code never receives a Supabase service-role key or distribution admin token. Authorization uses a server-validated operator role.

## Canonical Data Model
- `growth_need_briefs`
- `growth_content_assets`
- `growth_campaigns`
- `growth_messages`
- `growth_publications`
- `growth_metrics_daily`
- `growth_attribution_touchpoints`
- `growth_outreach_contacts`
- `growth_email_queue`
- `growth_operators`

The newsletter distribution migration has not been applied to live Supabase. It must not become a second production model. Existing newsletter services and tests adapt to the generic schema through a temporary compatibility layer.

The standalone tracker's postings, issues, sweeps, final copy, URLs, statuses, and manual metrics receive a one-time import with stable legacy IDs. JSON export/import remains disaster recovery, not normal storage.

## Automation Boundaries
Automate early:

- repository content discovery, UTM generation, and validation,
- channel draft generation and duplicate/stale-data checks,
- Search Console and GA4 aggregate imports,
- product attribution and activation aggregation,
- review reminders, anomalies, and weekly summaries.

Keep human-reviewed:

- final angle and evidence selection,
- sensitive hiring and layoff content,
- Reddit, LinkedIn-comment, WhatsApp-group, and community replies,
- outreach-contact eligibility,
- final copy and major campaign decisions.

Social APIs are optional adapters. The system remains usable when a platform has no API, changes policy, or suspends an account.

## Failure And Recovery
- Unpublished assets or missing canonical URLs cannot distribute.
- Expired evidence moves an asset to `needs_refresh` and blocks derivatives.
- Campaign and message creation is idempotent by asset, channel, and variant.
- Failed analytics imports preserve the last snapshot and show staleness; zero is never invented.
- Missing UTM data is `unattributed`, never guessed.
- Publication failures retain approved copy and record the error.
- A suspended channel pauses globally while other channels continue.
- Records archive instead of destructive deletion.
- Every generated message remains traceable to its asset and evidence.

## Privacy And Trust
- Growth reports use aggregate data by default.
- Attribution stores campaign identifiers and timestamps, not CV content.
- Anonymous pre-signup attribution has bounded retention.
- Outreach contacts require provenance, lawful basis, suppression state, and immediate unsubscribe handling.
- Aggregate data stories disclose sample size, freshness, and known coverage gaps.
- Private skills, applications, CV text, email, and identity never enter public content or growth views.

## Rollout
### Phase 1 - Truth And Attribution
- Repair newsletter canonical-domain inconsistencies.
- Persist UTM attribution through all signup paths and activation.
- Introduce generic growth tables and operator authorization.
- Import the tracker and retain JSON backup.
- Ship private Content and Distribution views with manual publishing.

**Implementation status (2026-06-13):** The canonical-domain repair, first/latest
UTM persistence, generic Phase 1 schema, server-side operator allowlist,
tracker compatibility/import path, and private `/admin/growth` cockpit are
implemented and committed on `Develop`. The live shared Supabase project has
the eight Phase 1 tables with RLS enabled and no browser policies; one owner
operator is active. The tables remain empty apart from that operator until the
`Develop` backend is deployed and the deterministic tracker import is run with
an authenticated operator token. A dry run currently resolves 8 assets, 12
campaigns, 22 messages, and 2 publications.

`growth_metrics_daily` belongs to Phase 2. `growth_need_briefs` belongs to Phase
3. They are intentionally absent from the Phase 1 migration.

### Phase 2 - Measurement
- Add Publication and Performance views.
- Import GA4 and Search Console aggregates.
- Connect campaigns to subscribers, signups, CV uploads, and useful actions.
- Generate daily alerts and a weekly decision report.

### Phase 3 - Need Radar
- Add repository, dataset, search, support, and curated community signals.
- Add brief triage, freshness, urgency, and editorial scheduling.
- Support the approved three-article plus one-tool weekly cadence.

### Phase 4 - Selective Automation
- Add APIs only for proven, stable channels.
- Schedule email only after consent, suppression, and sender operations are production-ready.
- Test selective informational-page ads only after stable organic traffic and only if activation is not materially harmed.

Each phase receives its own implementation plan and test gate. Phase 1 passed
its implementation gate on 2026-06-13; production deployment and the
authenticated one-time tracker import are the remaining operational steps.

## Testing Strategy
- Service tests: UTMs, idempotency, status transitions, evidence expiry, attribution, and activation definitions.
- Repository tests: operator access, RLS expectations, imports, suppression, archives, and aggregates.
- Frontend tests: tracker parity, review gates, stale analytics, paused channels, accessibility, and 375px overflow.
- Migration tests: legacy import and campaign deduplication.
- End-to-end test: asset -> publication -> signup attribution -> activation report.
- Manual browser QA: desktop operations and 375px emergency review.

## Acceptance Criteria
1. The standalone tracker is no longer the only source of campaign truth.
2. Newsletters, guides, tools, company pages, and career pages use one content and campaign model.
3. Every publication traces to approved copy, a canonical asset, evidence, and a complete UTM identity.
4. Attribution survives password, magic-link, and OAuth signup.
5. Reports show activated users by source, campaign, asset, and publication.
6. Sensitive and community responses cannot bypass human review.
7. The system operates when any social API is unavailable.
8. No private CV, application, skill, or identity data appears in growth views.
9. Operators identify today's most urgent useful action in under one minute.
10. Weekly decisions prioritize career-product activation over vanity reach.

## Locked Decisions
- One domain: `himyro.com`.
- Hybrid, product-first business model; selective ads later.
- India-first data pages plus globally useful CV and interview guidance.
- Three articles and one tool or data page weekly.
- One newsletter assembled from the strongest weekly insight.
- The Growth Command Center becomes the system of record.
- Human approval remains mandatory for sensitive and trust-dependent channels.
- Phase 1 starts with truth, attribution, generic data, and tracker migration, not broad social API automation.
