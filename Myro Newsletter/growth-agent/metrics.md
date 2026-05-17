# Metrics Contract

This file defines what Myro Growth Mission Control measures and how campaign links should be formed.

## Funnel

1. **Reach:** impressions, post views, community replies, newsletter page sessions.
2. **Interest:** newsletter subscribers and `newsletter_cta_click` events.
3. **Signup:** verified Myro platform accounts created.
4. **Activation:** onboarding completion or CV upload.
5. **Share loop:** user shares a Myro result, score page, profile, or referral link.

## Targets

| Date | Account Target | Activation Target |
|---|---:|---:|
| 2026-05-31 | 300-500 | 150-250 |
| 2026-06-16 | 2,000 | 900 |
| 2026-07-01 | 5,500 | 2,750 |
| 2026-07-16 | 10,000 | 5,000 |

## Required UTM Parameters

Every public CTA should include:

```text
utm_source=<channel>
utm_medium=<surface>
utm_campaign=<campaign-slug>
utm_content=<creative-or-post-id>
```

Examples:

```text
/signup?utm_source=newsletter&utm_medium=issue&utm_campaign=2026-05-fintech-hiring-india&utm_content=inline-cta
/signup?utm_source=linkedin&utm_medium=social&utm_campaign=phase0-day01-wrong-market&utm_content=founder-post
/signup?utm_source=instagram&utm_medium=social&utm_campaign=phase0-day05-skills-that-hire&utm_content=carousel
/signup?utm_source=facebook&utm_medium=social&utm_campaign=phase0-day06-weekend-audit&utm_content=group-post
/signup?utm_source=substack&utm_medium=email&utm_campaign=phase0-day07-ai-age-brand&utm_content=note
/signup?utm_source=x&utm_medium=social&utm_campaign=phase0-day12-future-proof&utm_content=thread
/signup?utm_source=hacker-news&utm_medium=community&utm_campaign=phase0-day03-india-hiring-pockets&utm_content=reply
/signup?utm_source=campus&utm_medium=referral&utm_campaign=fellowship-launch&utm_content=<fellow-or-campus-code>
```

## Known Tracking Gap

signup currently sends only `email`, `password`, and `full_name`.

A future code slice must persist attribution metadata on signup and activation. The minimum implementation should capture `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content` from the signup URL, carry them through account creation, and make them available for funnel reports.

## Daily Report Metrics

```text
Accounts yesterday:
Accounts last 7 days:
Accounts total:
Activations yesterday:
Activations last 7 days:
Activations total:
Signup-to-activation conversion:
Top source:
Top campaign:
Weakest source:
Best post or reply:
Next experiment:
```

## Channel Decision Rules

- Scale a channel when it creates activated users.
- Rewrite a channel when it creates clicks but not signups.
- Improve onboarding or CTA fit when signup-to-activation conversion is below 50%.
- Pause channels that create low-quality or untraceable signups.
- Never count unverifiable signups toward fellowship points.

## Dashboard Queries To Implement

The next code slice should provide queryable views for:

- signups by `utm_source`,
- signups by `utm_campaign`,
- activations by `utm_source`,
- activations by `utm_campaign`,
- signup-to-activation conversion by campaign,
- suspected duplicate or suspicious referral activity.
