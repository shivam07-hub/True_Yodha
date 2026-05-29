# ADR-0010 — Web / Mobile Platform-Shell Seam

- **Status**: Accepted (C2 + C1 shipped; C3 + C4 deferred with reasons below)
- **Date**: 2026-05-30
- **Related**: backlog #9 (v2 native APK — `packages/api-client`, `mobile-native/` sibling, `packages/mobile-shared`) · ADR-0003 (page-scoped CSS) · `project_mobile_layout`

## Context

We are building a native APK from the mobile design. Before that, web and mobile chrome were entangled in one place, so edits to one surface risked the other:

- **`components/app-shell.tsx` rendered BOTH platforms.** It defined the web `AppTopBar` inline *and* imported `MobileTopBar`/`MobileBottomNav`/`MobileProfileSheet` from `@/mobile`, then rendered both — desktop JS-gated, mobile chrome hidden by CSS `@media`. One module owned web + mobile layout.
- **The dependency was a cycle.** `app-shell.tsx` imported from `@/mobile`; `mobile/shell.tsx` imported back from `@/components/app-shell` (`openFeedbackHub`, `SidebarProfile`). Web shell ⇄ mobile shell — neither could move without the other. Fatal for an APK that wants `mobile/` standalone.

Hard constraint for the refactor: **zero pixel or behaviour change on web or mobile.** `useViewport` resolves to `isDesktop:false` (mobile) on SSR + first paint, then flips after `useEffect`; today both chromes are in the DOM and CSS `@media` toggles them pre-JS (flash-free), while the desktop top bar is JS-gated. A naïve switch to JS-only mounting would flash the wrong chrome.

## Decision

Establish a **platform-shell seam**: one seam (`AppShell`) picks the chrome adapter; shared state lives behind a neutral model; neither platform adapter imports the other.

**Shared core** (web + future RN APK both consume):
- `lib/shell/contract.ts` — `SidebarProfile` (neutral chrome-profile shape).
- `lib/shell/use-shell-model.ts` — `useShellModel()`: XP balance, chrome profile, feedback-hub / XP-modal / mobile-sheet open state, ambient-XP claim handler, sign-out. Platform-agnostic; the interface is the test surface (drive the hook, assert the model, render no chrome).
- `lib/api`, `mobile/viewport.ts` constants, domain types.

**Platform surfaces** (one each, independent):
- **Web** — `components/shell/web-chrome.tsx` (`WebChrome`): the desktop top bar (brand, nav, forge chip/popover, XP pill, account menu, settings/sign-out/myrology). Web chrome CSS stays in `app/globals.css`.
- **Mobile** — `mobile/shell.tsx` (`MobileTopBar`, `MobileBottomNav`, `MobileProfileSheet`) + `ForgeXpPill`. The native APK reuses these + `useShellModel`, never `WebChrome`/`AppShell`.

**`AppShell` is now a thin seam**: `useShellModel()` + shared overlays (`ForgeClockDriver`, `XPGateModal`, `XpExplainerModal`, `FeedbackHub`/`FeedbackFAB`, `ParticleBg`) + `{isDesktop && <WebChrome/>}` + the mobile bars. **Visibility stays CSS/gate-driven exactly as before** — no mount-strategy change → no first-paint flash.

## Why the cycle break matters

`SidebarProfile` moved to `lib/shell/contract.ts`; `openFeedbackHub` is imported from its true source (`@/components/feedback`). `mobile/` no longer imports `components/app-shell` — the back-edge is gone. The APK can lift `mobile/shell` + `useShellModel` + `lib/api` with zero web baggage.

## What is intentionally NOT done (and why)

The naïve "separate everything web vs mobile" would also (C3) lift `useViewport()` branching out of 8 shared leaf components (radars, `particle-bg`, `company-drawer`, `ScoreSparkle`, `brand-particles`, tracker) and (C4) move mobile chrome CSS out of `globals.css`. **Both are deferred:**

- **The APK is React Native.** It uses `StyleSheet`, not CSS, and reimplements leaf rendering in RN. It will never import `globals.css`, `particle-bg`, or `company-drawer`. So neither C3 nor C4 advances the APK-separation goal — their only gain is *web-side edit-locality*.
- **C4** would require byte-perfect extraction of mobile chrome rules from inside a 165-line shared `@media (max-width: 768px)` block, with mobile cascade order unverifiable without an authed-mobile visual pass. Risk > reward.
- **C3** edits 8 behaviour-sensitive responsive components whose viewport branch is web-internal (responsive web), not a web↔mobile bleed.

**Revisit C3/C4 only if a `packages/mobile-shared` web-PWA extraction actually begins** — i.e. when the shared package is real code, not a hypothetical. Until then, the module/import seam (this ADR) is the separation that pays.

## Consequences

- A mobile-chrome change touches `mobile/shell.tsx` / `ForgeXpPill` only; a web-chrome change touches `components/shell/web-chrome.tsx` only. No shared file holds both.
- `useShellModel` is unit-testable without rendering chrome.
- Web build behaviour is byte-identical (same gating, same CSS).
- The APK's shared-core surface is now explicit: `useShellModel` + `lib/api` + `mobile/*` + domain types.
