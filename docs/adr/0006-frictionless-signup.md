# ADR-0006 — Frictionless signup (OAuth + magic-link primary; anon trial killed)

Date: 2026-05-24 (LinkedIn add-on locked same day)
Status: Accepted
Supersedes: Backlog #13 (Anonymous trial flow — upload before signup)

## Context

Beta-2 intake (2026-05-24) escalated "users bounce at signup wall before seeing any value" to P0. Backlog #13 originally proposed an anonymous trial flow: visitor uploads CV at `/about`, sees skills + domain map + top 3 matches BEFORE signup. A `/grill-me` session walked 18 design forks before any code.

Competitor scan (LinkedIn, Indeed, Workday, Glassdoor, ZipRecruiter, Jobscan, Teal, Rezi, Resume.io/Zety):
- Browse/search = anon.
- AI/LLM cost behind identity, universally.
- Only CV *builders* allow anon usage (gate at PDF download). Myro's cost is the build step, not the export step.

Conclusion: anon trial is the wrong abstraction. Industry primitive = frictionless signup (one-tap OAuth + magic-link), then AI. Friction delta vs anon = ~3 seconds. Eliminates the entire anon-state handoff problem.

## Decision

Replace Backlog #13 (anon trial) with frictionless signup. 18 sub-decisions, summarised below. See companion `docs/grill-frictionless-signup-2026-05-24.md` for the full grilled reasoning per fork.

### Auth surface

1. **Signup paths = 3** (Google OAuth + LinkedIn OAuth + magic-link). **Login paths = 4** (+ password for legacy 110 users). Password is preserved for login but not offered as a new-signup option. **Button order** = Google → LinkedIn → magic-link (familiarity-first, surface-aware ordering rejected as premature optimization).
2. **`/signup` route survives** as the magic-link landing twin + SEO surface + no-JS fallback. Modal is the primary conversion surface; route mounts the same `<SignupForm/>` component.
3. **Modal trigger = high-intent surfaces only**: `/about` hero "Start your CV hub" CTA · `/cv` upload tap (anon) · `/profile/{ninja}` ghost radar tap (SH4) · `?share=` deep-links. Incidental anon hits to `/intel`, `/forge`, `/skills`, `/companies/*` redirect to `/about?next=…`.
4. **Auth-before-file order.** Modal asks for auth method first; post-auth, file picker auto-opens via existing `?upload=1` query (shipped in `c3abff7`). Eliminates the OAuth round-trip state-preservation problem instead of solving it (Ousterhout: best modules eliminate complexity, don't manage it).

### Round-trip + provisioning

5. **Single `/auth/callback` consumer route.** Handles both OAuth (`?code=`) and magic-link (`#access_token=`) via Supabase client SDK `getSessionFromUrl`.
6. **`POST /auth/post-signin`** backend endpoint reads `myro_ref` cookie + JWT → calls `ensure_user_provisioned(myro_ref=…)`. Preserves SH7 viral loop on OAuth path (today `deps.py:_ensure_profile_provisioned` hardcodes `myro_ref=None`, drops referral attribution silently for OAuth).
7. **Verified-email collision = auto-link** via Supabase identity linking. Password user can return + sign in with Google using the same email; same `auth.users` row, no data loss. Google verifies email before issuing token → zero net attack surface added.

### Failure modes + abuse

8. **In-app browser handling** (WhatsApp / Instagram / FB / Line / WeChat). UA-sniff. Detected → swap "Continue with Google" for "Open in browser to continue with Google" + magic-link inline. Use PKCE flow type to bypass Safari ITP cookie restrictions.
9. **Modal dismissal**: Esc + X both dismiss freely; click-outside disabled (mobile misclick prevention). Stateless dismissal — returns to underlying page with URL preserved.
10. **Magic-link rate-limit**: 3 sends/hour/IP via `magic_link_attempts` table + `POST /auth/magic-link-request` wrapper around Supabase `signInWithOtp`.
11. **CV upload rate-limit**: 5/hour/user in `_start_async_upload_job` before charge. Caps worst-case LLM cost ceiling regardless of bot count.
12. **Magic-link failure UX**: expired link → one-tap resend · didn't arrive (30s timer) → resend button + alt-email + spam tip · email typo → inline syntax validate + soft confirm before send.

### Forgot-password

13. **Dropped.** Magic-link IS the recovery path. Add inline "Forgot password? Email me a link instead" link on `/login` password field. Closes open P0. Settings → Change password is a separate small flow, built only on explicit user request.

### Telemetry (10 GA4 events via existing `lib/analytics.ts`)

```
signup_modal_shown                  { surface, in_app_browser, has_ref }
signup_method_tapped                { method: google|magic_link|password, surface }
signup_oauth_redirect_started       { provider }
signup_oauth_callback_returned      { success, error_code }
signup_magic_link_sent              { email_domain_hash }
signup_magic_link_consumed          { latency_ms }
signup_completed                    { method, first_signup, ref_attributed, surface }
signup_failed                       { method, stage, error_code }
signup_modal_dismissed              { surface, method_seen_count, time_open_ms }
signup_in_app_browser_warning_shown { agent }
```

Email hashed `sha256[:8]` for corp-vs-personal cohort segmentation without storing addresses (PV1 alignment).

### LinkedIn integration (add-on grill, 7 decisions)

Same-day grill walked LinkedIn-as-third-pathway because OAuth provider was enabled on Supabase. Stake sentence (*"home for every CV version, scored against live jobs"*) survives — LinkedIn-derived data = synthetic CV v0; user retains version history.

L1. **LinkedIn OAuth scope = identity only** (`openid profile email`). Partner-tier `r_fullprofile` is gatekept by LinkedIn (6-12mo application, mostly rejected). Scraping LinkedIn profile URL is ToS-violating (HiQ Labs 2022). **C4 of mini-grill**: OAuth = identity; "Import from LinkedIn" = onboarding-time data path, parallel to PDF upload + paste text.

L2. **Import mechanism = LinkedIn "Save to PDF"**, NOT data-export ZIP. LinkedIn's native Profile → More → Save to PDF generates a styled CV-like PDF instantly. Reuses the existing PDF upload pipeline unchanged (CVUP1 idempotency, CVUP3 orphan sweep, scanned-PDF guard, refund-on-fail). Zero new parser code. ZIP export rejected because: 10-min email delay violates beta-2 <90s SLO; new CSV parser surface; same data delivered by Save-to-PDF.

L3. **Onboarding `StepCV` = 3-segment toggle** (`Upload` | `Describe` | `LinkedIn`) instead of current 2-segment. Default segment auto-selects from auth method (LinkedIn OAuth → LinkedIn segment pre-selected). LinkedIn segment UI = numbered instruction list (`1. LinkedIn → Profile → More → Save to PDF · 2. Drop the file below`) + identical dropzone. No time promises in copy (loading page owns time-perception; see `project_optimistic_reveal` memory).

L4. **`/auth/post-signin` reads `linkedin_url` + headline + verification status from the OIDC ID token directly.** REVISED 2026-05-24 evening: LinkedIn granted partner access including `r_profile_basicinfo` + `r_verify` scopes. The vanity URL ships in the standard OIDC claims when those scopes are present — NO separate `api.linkedin.com/v2/me` call needed. Dropped: `app/services/linkedin_api.py::fetch_vanity_name`. New behavior: `/auth/post-signin` parses JWT claims (`vanityName`, `headline`, `verified`), writes `linkedin_url = https://linkedin.com/in/{vanityName}` + (optionally) `linkedin_headline` + `linkedin_verified`. Triggers existing 50-XP grant. Failure-graceful — missing claims → silent skip. Same `linkedin_xp_granted` flag prevents double-grant.

L5. **PV1 disclosure = tiered.** Plain `<details>` expander under LinkedIn button in modal. Updated copy reflects expanded scope set granted by LinkedIn:
```
[ Continue with LinkedIn ]
  ↳ Shares name, headline, photo, profile link, verification status
    [ What else? ]  ← expand
        We read: name, email, profile picture, LinkedIn vanity URL,
                 headline, verification status.
        We grant: 50 XP for connecting your LinkedIn profile.
        We don't: post on your behalf, message your connections,
                  scrape your network, or read your work history.
                  (You can share to LinkedIn from inside Myro — only
                  when you tap the button.)
```
Same pattern under `StepCV` LinkedIn segment discloses PDF contents (positions, skills, education). Sets the disclosure template for future integrations (Apple, GitHub, Calendar sync).

L6. **Telemetry extended** — `method` enum gains `linkedin`; 3 new events: `signup_linkedin_vanity_fetched { success, latency_ms }`, `signup_linkedin_disclosure_expanded { surface }`, `cv_input_source_selected { source }`. 12 GA4 events total.

L7. **`cv_versions.source` migration** — `20260524_cv_versions_source.sql` adds `source TEXT CHECK (source IN ('pdf_upload', 'text_describe', 'linkedin_pdf'))` + partial index. Existing 110 rows = NULL (unknown). Going-forward every baseline_upload tagged. Enables cohort retention analysis by entry path. `uploadCV(token, file, source)` signature extended.

**Onboarding step ordering unchanged** — `cv → role → ninja → score` preserved. Restructuring rejected: beta evidence shows skip-CV users rarely return; current order matches `<RequiresCV>` gate semantics throughout the app.

### LinkedIn partner-tier scopes (granted 2026-05-24 evening — added to ADR)

LinkedIn approved Myro Intelligence app for these scopes beyond standard OIDC: `r_profile_basicinfo` · `r_verify` · `w_member_social`. Strategic posture:

**Granted scopes used at signup (read-only set):**
- `openid` · `profile` · `email` — standard OIDC identity
- `r_profile_basicinfo` — name + headline + photo URL + vanity URL (replaces the Q5 separate API call)
- `r_verify` — verification status (low-adoption today, exposed as opt-in badge on `/profile/{ninja}` for future-proofing)

**Write scope (`w_member_social`) — incremental authorization pattern.** NOT requested at signup. Requested lazily at the moment user taps "Share to LinkedIn" inside Myro. Rationale: write-scope in initial OAuth screen drops conversion ~30% (industry data); contextual scope request when user has already indicated intent converts at 60-80%. Code shape:
```ts
// Initial signup:
supabase.auth.signInWithOAuth({
  provider: 'linkedin_oidc',
  options: { scopes: 'openid profile email r_profile_basicinfo r_verify' }
})

// Later, on user-initiated "Share to LinkedIn" tap:
supabase.auth.signInWithOAuth({
  provider: 'linkedin_oidc',
  options: { scopes: 'openid profile email r_profile_basicinfo r_verify w_member_social' }
})
```

### LinkedIn write-scope principles (binding)

1. **Never auto-post.** No scheduled posts, no "share my weekly progress automatically," no toggle that defaults ON. Every post fires from an explicit user tap.
2. **Preview modal mandatory on first share per type.** Each new post type (score share, milestone share, CV-update share) requires user-confirmed preview the first time.
3. **Quick-share shortcut allowed AFTER first preview.** Subsequent shares of the same type can fire with a one-tap "Quick Share" button bypassing the modal — virality requirement. User can re-enable preview-always per type in Settings → Integrations.
4. **Granular per-feature gating.** Each new shareable feature (Score, milestone, CV update, weekly digest, etc.) ships with its own opt-in moment, NOT a blanket "allow all LinkedIn shares" toggle.
5. **Easy disconnect** — Settings → Integrations panel one-click revoke. Removes the lazy scope grant from Supabase identities table. User retains identity-only LinkedIn login.

### v2 backlog adds

- **"Share to Myro" → v2 PR.** First shareable surface = Myro Score. Triggers incremental `w_member_social` scope grant on first tap; preview modal once; quick-share thereafter. Telemetry: `linkedin_share_initiated { surface, type }` · `linkedin_share_scope_granted { granted }` · `linkedin_share_posted { type, latency_ms }` · `linkedin_share_revoked { type, time_since_grant_ms }`. Expand to milestone share + CV-update share once Score share validates.
- **Settings → Integrations panel** (modeled after a billing panel — connections as first-class management surface). Lists active integrations (LinkedIn, Google) with: connection status · scopes granted · last sync · per-feature preview/quick-share preferences · disconnect button. Per integration, "Connect" CTA shown if not connected. New file: `components/settings/integrations-panel.tsx`. Supabase identity revocation via `supabase.auth.admin.deleteIdentity(identityId)` from a thin backend endpoint. Mirrors industry pattern (Stripe Connections, Linear Integrations, Notion Settings → Connections).

### Components

14. **Split `AuthForm` → `SignupForm` + `LoginForm` + `auth/shared/` atoms** (`google-button`, `magic-link-input`, `check-inbox-panel`, `in-app-browser-warning`). Delete `AuthForm`. Each component owns one state machine; mode-prop spaghetti eliminated.
15. **`useSignupGate` hook + `signupGateStore` (zustand) + `<SignupModal/>` mounted once in `AppShell`** — mirrors the XPGate precedent (`8fa7a2c`). Surfaces call `signup.open({ surface, next, source })`; single mount = single dismissal/focus/telemetry path.
16. **Copy** (Q11 lock):
   ```
   Start your CV hub
   Score your CV against live jobs. Keep every version you've ever tailored.

   [ Continue with Google ]
   [ Email me a link ]

   Free · No spam · Any email works — throwaway is fine
   ```
   Echoes Brooks stake sentence + PV1 trust signals. In-app browser variant swaps Google button copy to "Open in browser to continue with Google."

### Rollout

17. **Single PR / big bang.** Accepted risk: surface regression = full revert. Trade-off: ships the whole new flow on one deploy; user sees one coherent change instead of staged inconsistency. Phased-flag rollout (option B in Q18) was rejected in favour of velocity.

## Consequences

### Positive

- Closes Backlog #13 without writing the anon-state handoff machinery (no `/cv/claim-anon` endpoint, no sessionStorage payload preservation, no `<RequiresUpload>` boundary, no double-LLM-cost on re-upload).
- Closes open P0 (forgot-password) by design substitution.
- Preserves SH7 referral attribution on OAuth path (current bug fix).
- Industry-aligned signup pattern (LinkedIn / Linear / Vercel / Cursor norm).
- Cost-control invariant preserved: LLM never fires for unidentified user. CVUP1 idempotency, CVUP3 orphan sweep, XP-DB1 welcome trigger all keep working unchanged.

### Negative

- 110 legacy password users + new cohort have asymmetric signup options (acceptable — password naturally sunsets).
- Magic-link email cost: ~$0-5/mo at current scale, ~$60/mo at 100K users. Trivial.
- Deliverability setup cost (SPF/DKIM/DMARC, disposable-email blocklist) is one-time half-day.
- Big-bang PR risk concentrated on one deploy.

### Parked escalations

- **Cloudflare Turnstile** invisible challenge before magic-link send — ship only if telemetry shows distributed bot pattern that IP rate-limit can't catch.
- **Welcome XP grant deferral** to first non-auth action — reopen only if welcome-XP bot drain observed.
- **Disposable-email domain blocker** on magic-link send (~3K-domain blocklist) — backlog item, ship in follow-up PR.

## Supabase configuration required (manual, pre-PR)

- ✅ Enable Google OAuth provider in Auth → Providers (done 2026-05-24)
- ✅ Enable LinkedIn OAuth provider (`linkedin_oidc` preferred over legacy `linkedin`) (done 2026-05-24)
- ✅ LinkedIn app partner-tier scopes granted: `r_profile_basicinfo`, `r_verify`, `w_member_social` (done 2026-05-24 evening; v1 PR requests `openid profile email r_profile_basicinfo r_verify` at signup; `w_member_social` deferred to lazy incremental request per binding write-scope principles above)
- Enable Identity Linking (Auth → Settings → "Enable Manual Linking" ON; automatic identity linking on verified email)
- Configure custom SMTP (Resend or AWS SES) in Auth → Email
- Add SPF/DKIM/DMARC DNS records for the sending domain
- Verify magic-link template copy aligns with PV1 (no real-name placeholder)
- PKCE flow type confirmed in Supabase client SDK (`flowType: 'pkce'`)
- LinkedIn OAuth app permissions: `openid`, `profile`, `email` (default OIDC scope set; partner-tier scopes NOT requested)

## Implementation surface (single PR)

### Backend
- `app/routers/auth.py`: `POST /auth/post-signin` (provider-aware: branches on `linkedin_oidc` to read `vanityName`/`headline`/`verified` directly from JWT claims; preserves SH7 ref attribution on all providers), `POST /auth/magic-link-request`, `DELETE /auth/integrations/{provider}` (revokes Supabase identity for v2 disconnect-button)
- `app/services/user_provisioning.py`: extend `ensure_user_provisioned` with optional `linkedin_url`, `linkedin_headline`, `linkedin_verified` params
- `app/services/cv_workflow.py`: 5/hour/user upload cap in `_start_async_upload_job`; accept `source` param on upload + text endpoints
- Migration `20260524_magic_link_attempts.sql`
- Migration `20260524_cv_versions_source.sql`
- Migration `20260524_user_profiles_linkedin_meta.sql` — adds `linkedin_headline TEXT`, `linkedin_verified BOOLEAN DEFAULT FALSE` to user_profiles (idempotent ALTER, default-safe for existing rows)
- Tests for both endpoints + rate-limit boundaries + JWT claim extraction edge cases (missing vanityName, missing headline, verified=false)

### Frontend
- `store/signupGateStore.ts`, `lib/hooks/use-signup-gate.ts`, `lib/is-in-app-browser.ts`
- `lib/analytics.ts`: add 12 signup events (use existing `trackEvent`); extend method enum to include `linkedin`
- `components/auth/signup-form.tsx`, `login-form.tsx`
- `components/auth/shared/{google-button,linkedin-button,magic-link-input,check-inbox-panel,in-app-browser-warning,linkedin-disclosure}.tsx`
- `components/auth/signup-modal.tsx`
- `components/onboarding/step-cv.tsx`: 2-segment → 3-segment toggle; auto-select default from auth provider; LinkedIn segment renders instruction list + identical dropzone + `<LinkedInDisclosure/>`
- `lib/api.ts`: `uploadCV(token, file, source)` + `uploadCVText(token, text, source)` signatures extended
- `app/auth/callback/page.tsx`, `app/signup/page.tsx`, `app/login/page.tsx`
- DELETE `components/auth/auth-form.tsx`
- Wire 4 trigger surfaces

### Docs
- This ADR
- CLAUDE.md: close Backlog #13, add carry-forward items
- Memory: feedback entry on auth-before-file order; project entry tracking carry-forward escalations
