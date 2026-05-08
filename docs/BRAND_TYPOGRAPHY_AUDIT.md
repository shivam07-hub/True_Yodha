# Myro Typography And Brand Philosophy

Research sources:

- Google Material typography: https://m2.material.io/design/typography/the-type-system.html
- Google Material layout metrics and keylines: https://m1.material.io/layout/metrics-keylines.html
- Google Antigravity launch note: https://developers.googleblog.com/en/build-with-google-antigravity-our-new-agentic-development-platform/
- Claude MCP App design guidelines: https://claude.com/docs/connectors/building/mcp-apps/design-guidelines

Current implementation scope: desktop website. Mobile-specific design is intentionally deferred.

## What Serious AI And Developer Products Do

Google uses a deliberately limited type system. Material's public type scale anchors UI around predictable roles: body at 16px, headline steps at 20/24/34/48/60/96px, and buttons at 14px medium. Its layout docs also tie type to a 4dp baseline grid and broader 8dp component grid. On the live Google Developers homepage, the product-marketing layer uses very large Google Sans display type, while dense content and UI fall back to Roboto-like functional sizes.

Claude's current public design guidance is even more restrained for app surfaces: three size roles, two weights, Anthropic Sans for host UI, Anthropic Serif available for brand/editorial expression, 12/14/16/20px text tokens, and explicit 24/28/36px heading tokens. The important lesson is not that all text should be huge. It is that small type is reserved for captions, not for primary trust-building copy.

Antigravity's official launch framing is about operating at a higher task level, manager surfaces, artifacts, screenshots, and review. Its design implication for Myro: career intelligence should feel like an orchestrated professional cockpit, not a tiny themed dashboard. Trust comes from clear evidence hierarchy and inspectable artifacts.

## What Was Weak In Myro

The public page leaned on one sci-fi sans voice for everything. That made the brand feel technically energetic, but not fully mature. The page also used 11-13px labels/buttons in places where a first-time user is deciding whether to trust the product. Tiny chrome is acceptable inside dense logged-in tools; it is not a good first impression.

## New Website Philosophy

Use a two-voice type system:

- Display/editorial: Source Serif 4 for the brand name, section headlines, and high-trust narrative moments.
- Product/UI: Inter for navigation, controls, filters, tables, and dense intelligence surfaces.

Use size roles deliberately:

- Hero: 80px desktop, 54px mobile.
- Display: 48px desktop, 38px mobile.
- Title: 32px desktop, 28px mobile.
- Heading: 22px desktop, 20px mobile.
- Body: 17px.
- Meta: 15px.
- Caption: 13px.

Use small text only for labels, captions, and secondary metadata. Primary CTAs should be 15-16px with at least a 44px target. Public navigation should feel like a product company, not a browser extension.

## Brand Asset Direction

The aperture mark stays. It already has a memorable signal. The surrounding system now does more of the respect-building work:

- White/light first-time surface with calm dark text.
- Serif wordmark moment for credibility.
- Restrained amber or teal accents, never neon as the public default.
- Larger first-viewport typography and cleaner evidence bands.
- Product intelligence remains dense, but no longer tiny.
