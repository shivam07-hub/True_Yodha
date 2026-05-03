# Newsletter Metrics

Source: Myro SEO Sales Engine Playbook (v1.0, April 28 2026)

---

## Day 30 / Day 90 targets

| Metric | Day 30 | Day 90 | Notes |
|---|---|---|---|
| Issues published | 22 | 65 | ~5/week cadence |
| Indexed pages | 22 | 65 | 1:1 with published |
| Organic sessions | 500 | 8,000 | GSC + GA4 |
| Email subscribers | 200 | 2,500 | Signup form capture |
| Skill-gap CTA completions | 50 | 800 | newsletter_cta_click events |
| Platform signups (CTA → product) | 20 | 350 | UTM-tagged: utm_source=newsletter |

---

## Where to read each metric

| Metric | Source | Query |
|---|---|---|
| Organic sessions | Google Analytics 4 | Session source = organic search, page path starts with /newsletter |
| Indexed pages | Google Search Console | Coverage report → Valid pages |
| CTA completions | GA4 events | Event name = `newsletter_cta_click` |
| Platform signups | Supabase `auth.users` | `raw_user_meta_data->>'utm_source' = 'newsletter'` |
| Email subscribers | Signup flow | Users created via /signup?utm_source=newsletter |

---

## Weekly measurement query (Supabase)

```sql
-- Signups attributed to newsletter (last 7 days)
SELECT
  COUNT(*) AS signups,
  raw_user_meta_data->>'utm_campaign' AS issue_slug
FROM auth.users
WHERE created_at > now() - interval '7 days'
  AND raw_user_meta_data->>'utm_source' = 'newsletter'
GROUP BY issue_slug
ORDER BY signups DESC;
```

Run every Monday before publishing the new issue. Track in `/data/hiring-signals.xlsx`.

---

## Evaluation cadence

- **Weekly (Monday):** issues published, CTA clicks, signups from newsletter UTM.
- **Day 30:** first full checkpoint against targets above. Identify top-performing themes.
- **Day 90:** full evaluation. Double down on top 2 themes; pause bottom performer.

---

## Analytics implementation

CTA clicks fire `trackEvent("newsletter_cta_click", { role, issue_slug })` via `frontend/lib/analytics.ts`.

`trackEvent` forwards to `window.gtag` if GA4 is wired. To add GA4:
1. Add `NEXT_PUBLIC_GA_ID=G-XXXXXXX` to Vercel env vars.
2. Add the GA4 script to `frontend/app/layout.tsx` root layout (use `next/script` with `strategy="afterInteractive"`).
3. Events will appear in GA4 → Reports → Events within 24h.
