# Automation Map

This file defines how Codex, Claude, and Shivam share the growth system.

## Ownership

| Owner | Responsibilities |
|---|---|
| Codex | Attribution, metrics, reports, UTM validation, leaderboard data, fraud checks, repo hygiene, implementation plans |
| Claude | Social drafts, newsletter derivative assets, fellowship copy, community replies, fellow prompts, voice polish |
| Shivam | Channel credentials, final feedback, sensitive approvals, legal/company status, public internship readiness |

## Handoff Flow

1. Claude drafts content in `Myro Newsletter/growth-agent/outbox/`.
2. Codex validates CTA links, UTM parameters, source claims, and funnel tracking.
3. The agent creates a review notice using the correct review window.
4. The post is scheduled or published only when the review policy allows it.
5. Codex records performance in `Myro Newsletter/growth-agent/reports/`.
6. The next daily run uses report learnings to adjust the calendar.

Newsletter issue campaigns use `growth-agent/newsletter-distribution-agent.md`.
Codex can create/import campaign records and queue approved email outreach;
social/API adapters must still honor the review matrix below.

## Review Matrix

### Allowed To Publish Or Schedule Directly

- Routine social posts from approved themes.
- Newsletter derivative posts.
- Daily content snippets.
- Fellow daily prompts after fellowship launch.

### Requires Advance Review

- Routine scheduled posts: notify Shivam 2 hours before publish.
- Launch or fellowship announcements: notify Shivam 24 hours before publish.
- Legal/company status mentions.
- Prize, certificate, internship, or leaderboard rule posts.
- Posts about layoffs or job loss that name a company or event.

### Never Auto-Publish

- Claims based on unverified numbers.
- Direct replies in sensitive communities without human read-through.
- Anything implying guaranteed jobs, guaranteed outcomes, or official college endorsement unless confirmed.
- Anything that collects personal data outside Myro's signup flow.
- Anything that asks fellows or captains to use fake accounts, bought lists, or repeated unwanted messages.

## Codex Checklist Before Scheduling

```text
CTA URL present:
UTM source present:
UTM medium present:
UTM campaign present:
UTM content present:
Source claim traceable:
Review deadline set:
Sensitive-topic check passed:
```

## Claude Checklist Before Marking Draft Review-Ready

```text
Hook is specific:
Copy sounds like Myro:
One dominant CTA:
No guaranteed-outcome claim:
No fake urgency:
Community value comes before Myro mention:
```
