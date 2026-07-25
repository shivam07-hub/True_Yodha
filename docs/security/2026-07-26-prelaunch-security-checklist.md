# Pre-launch security checklist

Date: 2026-07-26
Branch: `Develop`
Scope: FastAPI API, Next.js frontend, live Supabase project, and observable
Railway/Vercel deployment posture.

No secret values were printed or copied into this report.

## Release decision

The requested controls pass in the local release candidate after seven scoped
implementation commits. Including this audit record, the changes are not
deployed: `Develop` is eight commits ahead of
`origin/Develop`, and the currently deployed frontend and APIs still return the
old header/CORS behavior. Railway configuration verification is also blocked by
an expired Railway OAuth session.

Do not promote this release to `main` until:

1. Railway access is restored and the required variable names are confirmed on
   both API services and the worker.
2. The eight local commits are pushed to `Develop`.
3. The dev deployment passes the live header, CORS, rate-limit, and startup
   checks documented below.
4. The reviewed changes are promoted through the normal `Develop` → `main`
   release path, followed by the same production smoke checks.

## 1. Environment variables

| Check | Before | Result | Fix/evidence |
|---|---|---|---|
| Every application env read is documented | Not enforced | **FAIL → FIXED** | Backend and frontend contract tests scan runtime source and fail when an env read is absent from the relevant `.env.example`. |
| Critical backend values stop production startup | Missing values could reach runtime paths | **FAIL → FIXED** | Startup now rejects missing/placeholder Supabase URL and keys, Redis URL, Turnstile secret, Razorpay key/secret/webhook secret, exact CORS origins, and the absence of every LLM provider key. |
| Critical frontend values stop production build/start | Not enforced centrally | **FAIL → FIXED** | `prebuild` and `prestart` validate Supabase URL/key, API URL, site URL, internal API URL, Razorpay public key, and Turnstile site key. Service URLs must use HTTPS. |
| Debug mode defaults off | Previously implicit | **PASS / HARDENED** | Backend default is `False`; production startup rejects `DEBUG=true`. |
| Live Railway variable inventory | Connector session expired | **BLOCKED** | Both Railway MCP and CLI return `Unauthorized. Please run railway login again.` No values were requested or exposed. |
| Live Vercel variable inventory | No connected team/project surfaced | **BLOCKED** | The Vercel connector returns no teams and there is no local `.vercel/project.json`. Production build validation proves the contract, not the deployed values. |

Commit: `843698d1 fix: fail closed on invalid production config`

## 2. Debug and test artifact removal

| Check | Result | Evidence |
|---|---|---|
| Runtime `console.log`, `console.debug`, or `console.trace` | **PASS** | Repository gate scans backend, frontend, extension, and ops-agent runtime roots. |
| Commented-out executable blocks | **PASS** | No matching declarations/functions remain in runtime roots. |
| Security-related `TODO` / `FIXME` | **PASS** | No incomplete auth/secret/RLS/CORS/security marker remains. |
| Hardcoded test credentials | **PASS** | No known test email/password/API-key pattern remains in runtime roots. |
| `/test`, `/debug`, `/admin-backdoor`, `/seed-data` endpoints | **PASS** | None found; the gate fails if one is added. |
| Debug default | **PASS** | Off by default and forbidden in production. |

Commit: `9cb58cb5 test: block prelaunch debug artifacts`

## 3. Error handling

| Check | Before | Result | Fix/evidence |
|---|---|---|---|
| Stack traces, SQL text, file paths, provider/database internals in client errors | No global boundary | **FAIL → FIXED** | Unhandled and all explicit 5xx responses use one generic message. Unsafe internal detail patterns in 4xx responses are replaced. Request-validation internals are suppressed. |
| Correlation ID | Inconsistent legacy trace lookup | **FAIL → FIXED** | Every API response receives `X-Correlation-ID`; every error envelope also contains `correlation_id`. The frontend reads the new header/body field with legacy fallbacks. |
| Detailed server diagnostics | Scattered | **PASS / HARDENED** | The server logs the correlation ID and traceback; the existing global log filter redacts secrets and personal identifiers. |
| Safe actionable client errors | Existing product contract | **PASS** | Fixed domain messages and reviewed structured 4xx contracts remain available; internal-looking content is denied centrally. |

Commit: `2e446147 fix: sanitize API error responses`

## 4. Security headers

| Header/control | Result | Fix/evidence |
|---|---|---|
| `X-Content-Type-Options: nosniff` | **FAIL → FIXED** | Added to API and all Next.js responses. |
| `X-Frame-Options: DENY` | **FAIL → FIXED** | Added to every response. Newsletter articles now render static chart previews; the interactive charts open as standalone pages, so no framing exception remains. |
| `Strict-Transport-Security` | **FAIL → FIXED** | `max-age=31536000; includeSubDomains` in both apps. |
| Content Security Policy | **FAIL → FIXED** | API uses a deny-by-default policy. Next.js uses a per-request nonce, `'strict-dynamic'`, same-origin scripts, and only the required Turnstile/Razorpay hosts. Production policy has no script `'unsafe-inline'`. |
| Next.js hydration under CSP | **PASS** | Production runtime smoke test confirmed every framework script nonce matches the CSP nonce. |
| Legacy interactive newsletter charts | **PASS** | Inline scripts are locked to reviewed SHA-256 hashes; matching static previews are required by a regression test. |
| Framework signature | **PASS / HARDENED** | Next.js `X-Powered-By` is disabled. |

Required third-party script exceptions are limited to
`challenges.cloudflare.com` and `checkout.razorpay.com`. Cloudflare documents
the Turnstile CSP requirement in its
[CSP guide](https://developers.cloudflare.com/turnstile/reference/content-security-policy/);
the nonce implementation follows the
[Next.js 14 CSP guidance](https://nextjs.org/docs/14/app/building-your-application/configuring/content-security-policy).

Commit: `93b71717 fix: enforce response security headers`

Framing follow-up: `9a8d5d45 fix: deny framing on newsletter charts`

## 5. Authentication rate limiting

| Endpoint/flow | Required | Result |
|---|---:|---|
| `POST /auth/login` | 5/min/IP | **PASS — 5/min/IP** |
| `POST /auth/signup` | Rate limited | **PASS — 5/min/IP** |
| Password recovery | 3/hour/IP | **PASS — 3/hour/IP** through the canonical magic-link recovery flow |
| OTP / magic link | Rate limited | **PASS — 3/hour/IP** on `POST /auth/magic-link-request` |

The limiter is an atomic Redis counter shared across API replicas. It runs
before request parsing, hashes IPs in Redis/log identifiers, uses the
proxy-appended right-most forwarding address, returns `429` plus `Retry-After`,
and fails closed with `503` in production if Redis is unavailable. There is no
separate password-reset endpoint; the product deliberately routes recovery
through magic link.

Commit: `3d9c67b2 fix: rate limit authentication attempts`

## 6. CORS

| Check | Before | Result | Fix/evidence |
|---|---|---|---|
| Wildcard origin | `allow_origins=["*"]` | **FAIL → FIXED** | API now reads `ALLOWED_ORIGINS` and accepts exact origins only. |
| Production origin transport | Not enforced | **FAIL → FIXED** | Wildcard, empty, malformed, credential-bearing, path-bearing, and non-HTTPS production origins are rejected. |
| Methods and request headers | Wildcards | **FAIL → FIXED** | Replaced with the actual API method/header allowlist. |
| Browser-readable operational headers | Missing | **FAIL → FIXED** | Correlation ID, retry delay, error code, ETag, and process timing are explicitly exposed. |
| Attacker-origin preflight | Allowed | **PASS after fix** | Regression test expects `400` and no `Access-Control-Allow-Origin`. |

The production value should contain only `https://himyro.com`,
`https://www.himyro.com`, and any intentionally retained exact Vercel domain.
Preview domains must be assigned deliberately to the dev API; regex/wildcard
origins are not enabled.

Commit: `9116777f fix: restrict API CORS origins`

## 7. Database security

| Check | Result | Evidence |
|---|---|---|
| Production application connection uses TLS/SSL | **PASS** | The app uses Supabase HTTPS APIs, not a native `DATABASE_URL`; production rejects a non-HTTPS `SUPABASE_URL`. A live SQL session reported server SSL on and the current connection at TLS 1.3 / 256 bits. |
| Default database credentials | **PASS** | Runtime source contains no PostgreSQL URL/password/default credential. Live role metadata shows only `postgres` and `authenticator` can log in, and both have passwords configured; `anon`, `authenticated`, and `service_role` are non-login roles. No password value was queried. |
| Database port exposed without authentication | **PASS** | Supabase native endpoints require valid database credentials even when IP restrictions are not configured. The project has no trust-capable application role and 0 API-granted public tables without RLS. Supabase documents this behavior in its [network restriction guide](https://supabase.com/docs/guides/platform/network-restrictions). |
| Row-level security baseline | **PASS** | Live metadata: 91/91 public tables have RLS enabled; 0 have RLS disabled. |
| Live project health | **PASS** | Supabase project `gipvxuugajkugntwkeiz` reports `ACTIVE_HEALTHY`. |

The application does not make a native PostgreSQL connection, so `sslmode` is
not applicable to runtime code. Supabase states that its HTTP APIs always
enforce SSL; native Postgres SSL enforcement is a separate project setting
documented in its
[SSL enforcement guide](https://supabase.com/docs/guides/platform/ssl-enforcement).
The CLI did not return that platform flag in this session, but the actual Myro
runtime connection and configuration are TLS-only.

### Additional Supabase advisor findings

These are outside the seven requested checks and were not mutated without a
separate database-contract review:

- 3 `security_definer_view` errors: `jobs_india`, `public_profile_v`,
  `taxonomy_skeleton_v`. At least `public_profile_v` intentionally exposes a
  safe public projection over private base data; blindly switching it to
  security-invoker could break the public-profile contract.
- Leaked-password protection is disabled in Supabase Auth.
- The advisor also reports mutable function search paths, broad function
  execution grants, extensions in `public`, and intentional anonymous/public
  policies. These require privilege-by-privilege migration review.

Advisor remediation references:
[database linter](https://supabase.com/docs/guides/database/database-linter) and
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Validation record

- Backend: `1621 passed` after the CORS change; focused security suites cover
  startup config, artifact gates, error envelopes, headers, rate limits, and
  CORS.
- Frontend: production build, TypeScript, Next lint, environment contracts,
  correlation-ID tests, CSP policy/hash tests, and live local nonce/header
  inspection.
- Live TLS: `api.himyro.com`, `truemirror.up.railway.app`, and `himyro.com`
  all passed certificate verification.
- Current deployed-state probe (before these local commits are pushed):
  production/dev APIs still return wildcard CORS, and the production frontend
  lacks the new CSP/nosniff/frame headers. This is expected because the branch
  is eight commits ahead of its remote, but it is a hard deployment gate.
