# Spec - Myro Growth Mission Control

**Date:** 2026-05-17
**Status:** Design approved, ready for implementation planning
**Owner:** Shivam
**Branch policy:** Work on `Develop`. Never merge directly to `main`.

---

## Why This Exists

Myro Newsletter is becoming the acquisition engine for Myro's platform. The immediate business target is ambitious: 10,000 Myro platform accounts in 60 days, with activated users as the north star. Activation means a user reaches onboarding completion or CV upload, because raw account creation without career-intelligence value is not enough.

The product already has the core newsletter foundation: public newsletter pages, MDX publishing, RSS and JSON feeds, UTM-bearing CTA links, and GA4 CTA events. What is missing is an operating agent that chooses daily growth moves, creates distribution assets, coordinates Codex and Claude work, tracks the funnel, and later manages the campus fellowship system.

## Goals

1. Build a repo-native growth agent called **Myro Growth Mission Control** inside `Myro Newsletter/`.
2. Track the full funnel: reach -> interest -> account creation -> activation -> share/referral loop.
3. Run a 14-day content growth engine immediately while company registration is in progress.
4. Design the campus fellowship system now, but keep public fellowship launch gated until company registration is ready.
5. Split Codex and Claude responsibilities cleanly so both can work in the repo without stepping on each other.
6. Preserve review windows before publication: 2 hours for routine posts, 24 hours for launch or fellowship announcements.
7. Use aggressive ethical outreach: persistent, useful, and direct, without deception, repetition, or irrelevant posting.

## Non-Goals

- No paid ad scale in the first 14 days. The first mode assumes a lean budget.
- No public internship or fellowship promise before company registration is ready.
- No fake signups, fake engagement, bought lists, scraped mass DMs, or spam rules encoded into the agent.
- No automatic publishing of sensitive posts about layoffs, legal/company status, prizes, certificates, or official college endorsements.
- No replacement of the Myro Newsletter authoring rules. Article drafting still follows the existing newsletter skill and voice notes.

---

## North Star and Funnel Definitions

**North star:** activated users who complete onboarding or upload a CV.

**Primary 60-day account target:** 10,000 Myro platform accounts by 2026-07-16.

The agent tracks five funnel stages:

1. **Reach:** impressions, post views, community replies, newsletter page sessions.
2. **Interest:** newsletter subscribers and newsletter CTA clicks.
3. **Signup:** verified Myro platform accounts created.
4. **Activation:** onboarding completion or CV upload.
5. **Share loop:** user shares a Myro result, score page, profile, or referral link.

Weekly gates prevent late discovery of funnel weakness:

| Date | Account Target | Activation Target |
|---|---:|---:|
| 2026-05-31 | 300-500 | 150-250 |
| 2026-06-16 | 2,000 | 900 |
| 2026-07-01 | 5,500 | 2,750 |
| 2026-07-16 | 10,000 | 5,000 |

If activation conversion is materially below 50%, the agent should prioritize onboarding friction and CTA quality before increasing distribution volume.

---

## Operating Phases

### Phase 0: Days 1-14 - Content Growth Engine

This mode starts immediately while company registration is in progress.

Daily work:

- Pick one sharp career claim from existing newsletter issues, dashboards, or Myro jobs data.
- Publish or schedule 2-4 platform-native posts.
- Draft 3-5 helpful community replies for relevant Reddit, Hacker News, Discord, WhatsApp, Telegram, or LinkedIn discussions.
- Track UTM signup and activation performance.
- Produce an evening growth brief with signups, activations, best link, weak link, and the next day's experiment.

Content themes:

- AI-era job market reality in India.
- Skills that still get hired.
- Data engineering and analytics as safer AI-era paths.
- Banking, fintech, consulting, and pharma hiring pockets.
- "Your resume is aimed at the wrong market."
- Why Myro Score or CV upload is the first useful step.
- Transparent public progress toward the 10,000-account mission.

Channels:

- Myro LinkedIn Page.
- Shivam LinkedIn when founder voice is useful.
- Instagram.
- Facebook.
- Substack.
- X, if available.
- Reddit, Hacker News, and other communities with manual-quality replies.
- WhatsApp and Telegram share kits once fellowship launch is closer.

Immediate analytics work needed:

- Preserve UTM parameters through signup.
- Attribute created accounts to channel and campaign.
- Attribute onboarding or CV completion to channel and campaign.
- Add a simple daily growth dashboard or report query.
- Make newsletter and post CTAs point to a consistent signup path.

### Phase 1: Days 15-60 - Fellowship Growth Engine

This mode is launch-gated until company registration is ready.

Positioning:

**Myro Campus Growth Fellowship** is for students and recent graduates who want real growth experience while helping peers understand the AI-era job market.

Structure:

- Up to 5 founding fellows.
- Each fellow owns a region, college cluster, or community cluster.
- Fellows recruit campus captains, class reps, club partners, and placement-cell contacts.
- Captains share approved links and host lightweight signup/onboarding drives.

Simple weighted leaderboard:

- 1 point: verified Myro platform account created.
- 3 points: onboarding or CV upload completed.
- 5 points: Myro result, score page, profile, or referral link shared.

Rewards:

- Founding Fellow internship title.
- Public leaderboard.
- Certificate.
- LinkedIn recommendation.
- Myro channel shoutouts.

Guardrails:

- No fake signups.
- No forced CV uploads.
- No misleading internship promises before company registration.
- No repeated posting where promotion is banned.
- No pressure around sensitive personal data.
- Fellows are rewarded for activated, useful adoption, not raw email collection.

---

## Agent Shape

**Agent name:** Myro Growth Mission Control.

**Primary workspace:** `Myro Newsletter/growth-agent/`.

Suggested repo artifacts:

- `mission-control.md`: agent charter, goals, modes, review policy.
- `daily-playbook.md`: daily content growth workflow.
- `weekly-playbook.md`: weekly planning, review, reporting, and experiments.
- `fellowship-playbook.md`: launch-gated fellowship operating system.
- `content-calendar.md`: 14-day immediate publishing calendar.
- `metrics.md`: funnel definitions, targets, dashboard queries, and attribution rules.
- `automation-map.md`: Codex tasks, Claude tasks, review windows, and human approval points.
- `outbox/`: generated drafts and scheduled post previews.
- `reports/`: daily and weekly growth briefs.

Operating modes:

- `content_growth_mode`: active immediately from 2026-05-17 through 2026-05-30.
- `fellowship_mode`: designed now, launch-gated until company registration is ready.
- `review_mode`: sends Shivam post previews before scheduled publishing.

---

## Codex and Claude Automation Split

### Codex Automation Owns

- UTM and attribution fixes in the app and backend.
- Signup and activation funnel queries.
- Newsletter sync, check, and feed jobs.
- Daily metrics snapshots.
- Leaderboard data model and fraud checks.
- Report generation from real numbers.
- Repo hygiene: docs, tests, automation files, and implementation planning.

### Claude Automation Owns

- Social post drafts and scheduling copy.
- Newsletter derivative assets.
- Fellowship announcement drafts.
- LinkedIn, Instagram, Substack, Facebook, and X content variations.
- Community reply drafts for Reddit, Hacker News, Discord, WhatsApp, and Telegram.
- Fellow onboarding material and daily prompts.
- Voice polishing against `Myro Newsletter/VOICE-NOTES.md`.

### Shared Workflow

1. Claude drafts content in `Myro Newsletter/growth-agent/outbox/`.
2. Codex validates links, UTM parameters, and funnel tracking.
3. The agent notifies Shivam before scheduled publishing.
4. After publishing, Codex records performance and generates the daily brief.

---

## Review and Publishing Policy

Allowed to publish or schedule directly once accounts are connected:

- Routine social posts from approved themes.
- Newsletter derivative posts.
- Daily content snippets.
- Fellow daily prompts after fellowship launch.

Requires advance review:

- Normal scheduled posts: notify Shivam 2 hours before publish.
- Launch or fellowship announcements: notify Shivam 24 hours before publish.
- Anything involving legal/company status, prizes, internship claims, certificates, or public leaderboard rules.
- Any post responding to layoffs or job loss that names a company or event.

Never auto-publish:

- Claims based on unverified numbers.
- Direct replies in sensitive communities without human read-through.
- Anything implying guaranteed jobs, guaranteed outcomes, or official college endorsement unless confirmed.
- Anything that collects personal data outside Myro's signup flow.

Outreach policy:

**Be persistent, useful, and direct. Do not be deceptive, repetitive, or irrelevant.**

Allowed:

- Posting in relevant student and career groups.
- DMing classmates, peers, alumni, and warm contacts.
- Asking club admins for permission.
- One thoughtful follow-up.
- Referral link sharing.
- Campus captain resharing.
- Event invitations and signup/onboarding drives.

Not allowed:

- Fake accounts.
- Misleading claims.
- Mass scraped DMs.
- Repeated messages after no response.
- Posting where promotion is banned.
- Pressuring users to upload CVs.
- Buying email lists.

---

## Daily and Weekly Reporting

The daily brief should show:

- Accounts created yesterday, last 7 days, and total.
- Onboarding or CV completions yesterday, last 7 days, and total.
- Signup source by channel and campaign.
- Top 3 posts or links by conversion.
- Weakest channel or CTA.
- What the agent will do tomorrow.
- What needs Shivam's review.

The weekly review should show:

- Progress against the weekly account and activation gate.
- Channel conversion ranking.
- Content themes that produced signups.
- Community sources that produced real activation.
- Funnel bottlenecks.
- Next week's experiments.
- Whether to increase, decrease, or pause each channel.

---

## Implementation Implications

The first implementation plan should start with Phase 0. Required first slices:

1. Create `Myro Newsletter/growth-agent/` with the core operating docs.
2. Fix UTM persistence through signup and activation tracking.
3. Add a simple metrics/reporting script or query set.
4. Create the 14-day content calendar and outbox structure.
5. Define automation handoff rules for Codex and Claude.
6. Keep fellowship launch materials drafted but not public until registration is ready.

The fellowship implementation should follow only after Phase 0 tracking is reliable and the company registration state is ready for public internship language.

## Acceptance Criteria

1. A developer can read the growth-agent docs and know what the agent does daily, weekly, and before publishing.
2. UTM attribution can connect newsletter/social/community campaigns to platform accounts.
3. Activation tracking can identify onboarding or CV upload completions by campaign.
4. The 14-day content growth engine can run without public fellowship promises.
5. Fellowship docs clearly explain structure, scoring, rewards, and outreach guardrails.
6. Publishing rules distinguish routine posts, major announcements, sensitive posts, and never-auto-publish content.
7. Codex and Claude ownership boundaries are explicit.

## Open Decisions Resolved

- User target: Myro platform accounts created, with activated users as the north star.
- Channel permission: full growth stack is allowed, but first two weeks are lean content growth.
- Budget: lean, $0-$1k.
- Fellowship audience: both college students and recent graduates.
- First cohort capacity: up to 5 fellows.
- Fellow model: fellows manage campus captains, class reps, and club partners.
- Leaderboard: simple weighted model.
- Rewards: credibility rewards only.
- Publishing: agent may schedule or publish once accounts are connected, with review windows.
- Outreach: aggressive ethical outreach, not spam as a rule.
