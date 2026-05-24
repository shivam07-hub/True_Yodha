# ADR-0006 — Frictionless signup (OAuth + magic-link primary; anon trial killed)

Date: 2026-05-24
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

1. **Signup paths = 2** (Google OAuth + magic-link). **Login paths = 3** (+ password for legacy 110 users). Password is preserved for login but not offered as a new-signup option.
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

- Enable Google OAuth provider in Auth → Providers
- Enable Identity Linking (Auth → Settings → "Enable Manual Linking" ON; automatic identity linking on verified email)
- Configure custom SMTP (Resend or AWS SES) in Auth → Email
- Add SPF/DKIM/DMARC DNS records for the sending domain
- Verify magic-link template copy aligns with PV1 (no real-name placeholder)
- PKCE flow type confirmed in Supabase client SDK (`flowType: 'pkce'`)

## Implementation surface (single PR)

### Backend
- `app/routers/auth.py`: `POST /auth/post-signin`, `POST /auth/magic-link-request`
- `app/services/cv_workflow.py`: 5/hour/user upload cap in `_start_async_upload_job`
- Migration `20260524_magic_link_attempts.sql`
- Tests for both endpoints + rate-limit boundaries

### Frontend
- `store/signupGateStore.ts`, `lib/hooks/use-signup-gate.ts`, `lib/is-in-app-browser.ts`
- `lib/analytics.ts`: add 10 signup events (use existing `trackEvent`)
- `components/auth/signup-form.tsx`, `login-form.tsx`
- `components/auth/shared/{google-button,magic-link-input,check-inbox-panel,in-app-browser-warning}.tsx`
- `components/auth/signup-modal.tsx`
- `app/auth/callback/page.tsx`, `app/signup/page.tsx`, `app/login/page.tsx`
- DELETE `components/auth/auth-form.tsx`
- Wire 4 trigger surfaces

### Docs
- This ADR
- CLAUDE.md: close Backlog #13, add carry-forward items
- Memory: feedback entry on auth-before-file order; project entry tracking carry-forward escalations
