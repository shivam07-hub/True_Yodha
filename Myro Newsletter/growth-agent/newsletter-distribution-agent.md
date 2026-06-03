# Newsletter Distribution Agent

Purpose: turn each published Myro Newsletter issue into a reviewable campaign for
student-facing distribution through public media contacts, LinkedIn, X,
Instagram, and WhatsApp.

## Current Slice

The backend now owns the durable campaign layer:

- contact import with email normalization, source provenance, outreach basis, and suppression status
- campaign creation from newsletter issue metadata
- generated channel drafts for email, LinkedIn, X, Instagram, and WhatsApp
- explicit campaign approval before outreach can be queued
- email queue rows for a future sender job

It does not auto-send email or auto-post to social. That is deliberate. The
agent prepares drafts and queue rows; humans approve public distribution.

## Freshest Social Paths

Last verified: 2026-06-02 in Perplexity Comet.

- X profile: `https://x.com/himyro`
- X composer: `https://x.com/compose/post`
- LinkedIn company admin: `https://www.linkedin.com/company/118214305/admin/dashboard/`
- LinkedIn page posts: `https://www.linkedin.com/company/118214305/admin/page-posts/published`

Do not use `https://www.linkedin.com/company/himyro/admin/`; LinkedIn currently
redirects that slug to an unavailable page. The durable working company path is
the numeric page ID above for **HiMyro Career Intelligence**.

## X Pause

As of 2026-06-03, pause all X drafting, scheduling and posting. The `@himyro`
account is suspended and Shivam has appealed. Resume X only after Shivam confirms
the account is restored.

## LinkedIn Native-First Rule

Default LinkedIn company-page posts should keep engagement inside LinkedIn:

- no outbound URL in the post body unless Shivam explicitly asks for one
- use the newsletter OG image or a native stat card instead of a link preview
- keep copy compact, human, and lightly edited; avoid list-like AI formatting
- use measured facts from the newsletter, but do not over-stack metrics

Do not generate X drafts while the X pause is active.

## Environment

Set this in the backend environment before using the endpoints:

```text
NEWSLETTER_DISTRIBUTION_ADMIN_TOKEN=...
```

Every endpoint requires:

```text
x-newsletter-agent-token: <token>
```

If the token is missing from the environment, the distribution API returns 503.
If the request token is missing or wrong, it returns 401.

## Tables

- `newsletter_outreach_contacts`
- `newsletter_distribution_campaigns`
- `newsletter_distribution_messages`
- `newsletter_email_outreach_queue`

All four tables have RLS enabled with no public policies. The backend service
role is the only intended writer.

## Workflow

1. Import contacts.
   - `contact_type`: usually `newspaper`, `college`, or `student_community`
   - `outreach_basis`: prefer `public_media_contact`, `existing_relationship`, `opt_in`, or `partner_referral`
   - `source_url` or `source_label` is required
   - do not import bought lists or scraped personal addresses

2. Create a campaign.
   - Send issue metadata: slug, title, summary, canonical URL, CTA role, issue number
   - The agent generates review-ready messages for requested channels
   - Campaign starts as `ready_for_review`

3. Review the drafts.
   - Email is outreach copy for public/student desks
   - LinkedIn is company-page copy
   - X is a six-post thread
   - Instagram and WhatsApp are adapter-ready placeholders for Meta integration

4. Approve the campaign.
   - Approval flips the campaign to `approved`
   - Email outreach cannot be queued before this

5. Queue email outreach.
   - Only `active` contacts are selected
   - Existing campaign/contact queue rows are skipped
   - Suppressed, unsubscribed, or bounced contacts stay out of the queue

## Meta Handoff

When Instagram and WhatsApp integration is ready, read from
`newsletter_distribution_messages`:

- `channel = 'instagram'`, `variant = 'carousel-caption'`
- `channel = 'whatsapp'`, `variant = 'share-message'`

Keep posting/sending status on those message rows or in a narrow adapter log.
Do not fork a separate campaign model for Meta.

## Policy

This agent follows `growth-agent/mission-control.md`:

- be useful before promotional
- do not use fake accounts or fake engagement
- do not buy email lists
- send one thoughtful follow-up at most
- respect unsubscribe/suppression immediately
