# Myro Growth Mission Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the actual repo-native Myro Growth Mission Control agent workspace inside `Myro Newsletter/growth-agent/`.

**Architecture:** The first slice is a file-based operating system, not an app service. Markdown runbooks define the agent charter, daily/weekly cadence, Codex/Claude handoff, metrics contract, content calendar, and launch-gated fellowship system. `outbox/` and `reports/` hold generated work products so future Codex and Claude automations have a stable place to read and write.

**Tech Stack:** Markdown, existing Myro Newsletter repo structure, existing newsletter docs, future Codex/Claude automations.

---

## File Structure

- Create `Myro Newsletter/growth-agent/mission-control.md`: agent charter, modes, goals, review policy, run command.
- Create `Myro Newsletter/growth-agent/daily-playbook.md`: daily Phase 0 workflow and required output format.
- Create `Myro Newsletter/growth-agent/weekly-playbook.md`: weekly planning, review, and experiment cadence.
- Create `Myro Newsletter/growth-agent/content-calendar.md`: concrete 14-day content growth calendar from 2026-05-18 through 2026-05-31.
- Create `Myro Newsletter/growth-agent/metrics.md`: funnel definitions, milestone gates, UTM contract, dashboard queries to implement.
- Create `Myro Newsletter/growth-agent/automation-map.md`: Codex vs Claude responsibilities, file handoffs, review windows.
- Create `Myro Newsletter/growth-agent/fellowship-playbook.md`: launch-gated campus fellowship operating system.
- Create `Myro Newsletter/growth-agent/outbox/README.md`: draft naming conventions and review states.
- Create `Myro Newsletter/growth-agent/reports/README.md`: daily and weekly report naming conventions and templates.

## Task 1: Create Mission Control Charter

**Files:**
- Create: `Myro Newsletter/growth-agent/mission-control.md`

- [ ] **Step 1: Create the charter file**

Add a concise operating charter with:

- Agent name: Myro Growth Mission Control.
- North star: activated users who complete onboarding or CV upload.
- Primary target: 10,000 platform accounts by 2026-07-16.
- Modes: `content_growth_mode`, `fellowship_mode`, `review_mode`.
- Review windows: 2 hours routine, 24 hours major announcements.
- Outreach policy: "Be persistent, useful, and direct. Do not be deceptive, repetitive, or irrelevant."
- Daily run command section that tells future agents where to start.

- [ ] **Step 2: Verify file renders cleanly**

Run:

```bash
sed -n '1,220p' 'Myro Newsletter/growth-agent/mission-control.md'
```

Expected: file contains no TODO/TBD placeholders and names the active mode as `content_growth_mode`.

## Task 2: Create Daily and Weekly Playbooks

**Files:**
- Create: `Myro Newsletter/growth-agent/daily-playbook.md`
- Create: `Myro Newsletter/growth-agent/weekly-playbook.md`

- [ ] **Step 1: Create daily playbook**

Add the Phase 0 daily workflow:

- Morning: choose one claim from newsletter/data.
- Midday: publish or schedule 2-4 posts.
- Afternoon: draft 3-5 community replies.
- Evening: write the daily growth brief.
- Required post preview format with channel, publish time, CTA URL, review deadline, source claim, and UTM.
- Required daily brief format with accounts, activations, source winners, weak link, tomorrow's experiment, and review queue.

- [ ] **Step 2: Create weekly playbook**

Add the weekly workflow:

- Monday planning and milestone check.
- Wednesday channel review.
- Friday experiment review.
- Sunday next-week calendar lock.
- Weekly report format covering gate progress, channel conversion ranking, bottlenecks, and next experiments.

- [ ] **Step 3: Verify both files**

Run:

```bash
rg -n "TODO|TBD|placeholder" 'Myro Newsletter/growth-agent/daily-playbook.md' 'Myro Newsletter/growth-agent/weekly-playbook.md'
```

Expected: no matches.

## Task 3: Create 14-Day Content Calendar

**Files:**
- Create: `Myro Newsletter/growth-agent/content-calendar.md`

- [ ] **Step 1: Add calendar overview**

Add the active window: 2026-05-18 through 2026-05-31.

Add the daily content formula:

- One data-backed claim.
- One founder or brand post.
- One student/recent-grad post.
- One community-seeding angle.
- One CTA path to `/signup` with campaign UTM.

- [ ] **Step 2: Add all 14 days**

For each day, include:

- Date.
- Theme.
- Primary claim.
- LinkedIn angle.
- Instagram/Facebook angle.
- Substack/newsletter angle when useful.
- Community prompt.
- CTA campaign slug.

- [ ] **Step 3: Verify date coverage**

Run:

```bash
rg -n "^### 2026-05-" 'Myro Newsletter/growth-agent/content-calendar.md'
```

Expected: 14 matches, one for each day from 2026-05-18 through 2026-05-31.

## Task 4: Create Metrics Contract

**Files:**
- Create: `Myro Newsletter/growth-agent/metrics.md`

- [ ] **Step 1: Add funnel definitions**

Define reach, interest, signup, activation, and share loop exactly as approved in the spec.

- [ ] **Step 2: Add UTM contract**

Define required URL parameters:

```text
utm_source=<channel>
utm_medium=<surface>
utm_campaign=<campaign-slug>
utm_content=<creative-or-post-id>
```

Define examples for newsletter, LinkedIn, Instagram, Facebook, Substack, X, Reddit/HN, and campus links.

- [ ] **Step 3: Add milestone gates and first analytics gap**

Include the 2026-05-31, 2026-06-16, 2026-07-01, and 2026-07-16 gates.

Call out the known implementation gap: signup currently sends only `email`, `password`, and `full_name`; a future code slice must persist attribution metadata on signup and activation.

- [ ] **Step 4: Verify analytics gap is explicit**

Run:

```bash
rg -n "signup currently sends only|future code slice|utm_source" 'Myro Newsletter/growth-agent/metrics.md'
```

Expected: all three phrases are present.

## Task 5: Create Automation Map

**Files:**
- Create: `Myro Newsletter/growth-agent/automation-map.md`

- [ ] **Step 1: Add ownership table**

Create a table with:

- Codex owns attribution, metrics, reports, leaderboard data, fraud checks, repo hygiene.
- Claude owns drafts, social variations, fellowship copy, community replies, voice polish.
- Shivam owns final feedback, sensitive approvals, channel credentials, legal/company status.

- [ ] **Step 2: Add handoff flow**

Document the workflow:

1. Claude drafts in `outbox/`.
2. Codex validates UTM and tracking.
3. Review notification is generated.
4. Post is scheduled or published.
5. Codex records performance in `reports/`.

- [ ] **Step 3: Add review matrix**

Include allowed-to-publish, requires-review, and never-auto-publish categories from the approved spec.

## Task 6: Create Fellowship Playbook

**Files:**
- Create: `Myro Newsletter/growth-agent/fellowship-playbook.md`

- [ ] **Step 1: Add launch gate**

State clearly that fellowship mode does not publicly launch until company registration is ready.

- [ ] **Step 2: Add program structure**

Include:

- Up to 5 founding fellows.
- Fellows manage campus captains, class reps, club partners, and placement-cell contacts.
- Audience: students and recent graduates.
- Rewards: title, certificate, LinkedIn recommendation, public leaderboard, Myro shoutouts.

- [ ] **Step 3: Add simple leaderboard**

Document:

- 1 point: verified account created.
- 3 points: onboarding or CV upload completed.
- 5 points: Myro result/referral shared.

- [ ] **Step 4: Add outreach rules**

Include allowed and not allowed outreach examples, with the exact policy line:

```text
Be persistent, useful, and direct. Do not be deceptive, repetitive, or irrelevant.
```

## Task 7: Create Outbox and Reports Conventions

**Files:**
- Create: `Myro Newsletter/growth-agent/outbox/README.md`
- Create: `Myro Newsletter/growth-agent/reports/README.md`

- [ ] **Step 1: Create outbox README**

Define draft file naming:

```text
YYYY-MM-DD-channel-campaign-status.md
```

Define statuses:

- `draft`
- `review-ready`
- `scheduled`
- `published`
- `paused`

Define required fields for every draft:

- channel
- publish time
- review deadline
- CTA URL
- UTM source/medium/campaign/content
- source claim
- copy

- [ ] **Step 2: Create reports README**

Define report naming:

```text
daily-YYYY-MM-DD.md
weekly-YYYY-MM-DD.md
```

Add templates for daily and weekly reports using the approved metrics.

## Task 8: Verify and Commit

**Files:**
- Verify all files under `Myro Newsletter/growth-agent/`

- [ ] **Step 1: Run placeholder scan**

Run:

```bash
rg -n "TODO|TBD|FIXME|placeholder" 'Myro Newsletter/growth-agent'
```

Expected: no matches.

- [ ] **Step 2: Inspect created files**

Run:

```bash
find 'Myro Newsletter/growth-agent' -maxdepth 3 -type f | sort
```

Expected: exactly the nine files listed in this plan.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short
```

Expected: the plan file and `Myro Newsletter/growth-agent/` files are changed or untracked; unrelated existing worktree changes may remain and must not be staged.

- [ ] **Step 4: Stage only this implementation slice**

Run:

```bash
git add docs/superpowers/plans/2026-05-17-myro-growth-mission-control-implementation.md 'Myro Newsletter/growth-agent'
```

- [ ] **Step 5: Commit**

Run:

```bash
git commit -m "feat(growth): add Myro growth mission control"
```

Expected: commit succeeds and includes only the plan file and growth-agent files.

## Self-Review

- Spec coverage: The plan creates all approved growth-agent operating docs, including content mode, fellowship mode, metrics, automation split, review policy, and outreach guardrails.
- Placeholder scan: The plan contains no TODO/TBD/FIXME instructions for the future agent. The word `placeholder` appears only inside verification commands that scan for it.
- Scope check: This slice deliberately does not implement app/backend attribution code. It makes that known gap explicit in `metrics.md` so the next implementation plan can tackle it as a testable code change.
