# Outbox

The outbox holds drafts, scheduled post previews, and reviewed content ready for publishing.

## File Naming

```text
YYYY-MM-DD-channel-campaign-status.md
```

Examples:

```text
2026-05-18-linkedin-phase0-day01-wrong-market-review-ready.md
2026-05-20-reddit-phase0-day03-india-hiring-pockets-draft.md
2026-05-30-linkedin-phase0-day13-mission-progress-scheduled.md
```

## Statuses

- `draft`: written but not checked.
- `review-ready`: checked for voice, CTA, and UTM; waiting for review window.
- `scheduled`: approved or auto-scheduled under policy.
- `published`: live and ready for performance logging.
- `paused`: held because the claim, tone, channel, or review state is not ready.

## Required Fields

Every draft should include:

```text
Channel:
Publish time:
Review deadline:
Status:
CTA URL:
UTM source:
UTM medium:
UTM campaign:
UTM content:
Source claim:
Copy:
```

## Review Notes

Normal posts need a 2-hour review notice before publish.

Launch, fellowship, company-status, prize, certificate, or public leaderboard posts need a 24-hour review notice before publish.

Community replies should be manually read in context before posting.
