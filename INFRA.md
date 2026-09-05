# MYRO — Infrastructure

> Servers, domains, environments, DNS, CORS, deploy order.
> Read before touching anything that deploys or any env var.
> Cockpit: [CLAUDE.md](CLAUDE.md)

---

## TOPOLOGY

**Infrastructure (TOPOLOGY — canonical, verified 2026-06-03):**

**Env split policy: Supabase = 1 env (shared) · Railway = 2 (dev + prod) · Vercel = 2 (prod + preview/dev).** Only the DB is single — deliberate: <10k users, want all real user data in one place. Do NOT split Supabase until scale justifies it.

Railway project = **`clever-embrace`** (`a15c0013-…`), ONE Railway environment object `production` (`f6a22e25-…`). The two "environments" (dev/prod) are the two **backend services**, sharing ONE worker + ONE Redis:

| Railway service | Role | Branch | Public URL | Start cmd |
|---|---|---|---|---|
| **`mirror-backend-dev`** (`149a7bdc`) | **DEV API** — ACTIVE (Vercel preview/dev hits this) | `Develop` | `truemirror.up.railway.app` | `uvicorn app.main:app …` |
| **`mirror-backend-prod`** (`6f9d873b`) | **PROD API** — the live backend | `main` | **`https://api.himyro.com`** (custom domain, LE cert) + `mirror-backend-prod-production.up.railway.app` | `uvicorn app.main:app --host 0.0.0.0 --port 8000` |
| **`True_Yodha`** (`1b3dca5a`) | **WORKER** — durable RQ runner (ADR-0008), 2/2 replicas, NOT an API. **Shared by both dev+prod.** | `Develop` | internal | `python -m app.workers.jobs_compute_worker` |
| **`Redis`** (`7f3503cf`) | RQ queue + global provider budget (ADR-0008), has `redis-volume`. **Shared by both dev+prod.** | — | `redis.railway.internal:6379` | — |

All services = repo `shivam07-hub/True_Yodha`, root `/backend`, builder RAILPACK.

- **Frontend (Vercel project `truemirror`, 2 envs):** Production env → domain **`himyro.com`** (+`www`, +legacy `truemirror.vercel.app`), `NEXT_PUBLIC_API_URL = https://api.himyro.com`. Preview/Develop env → `NEXT_PUBLIC_API_URL = https://truemirror.up.railway.app` (dev backend). (Prod cutover from `truemirror.up.railway.app`→`api.himyro.com` done 2026-06-03.)
- **Request chain (prod):** `himyro.com` → `api.himyro.com` (mirror-backend-prod, `main`) → Supabase + Redis; heavy LLM jobs → Redis → `True_Yodha` worker.
- **Shared-infra couplings (known, accepted at this scale):** (a) dev + prod jobs share ONE Redis queue + ONE `llm:budget:slots` bucket — a dev test upload competes with prod traffic. (b) Worker tracks `Develop` while prod API tracks `main` → prod jobs are processed by slightly-ahead worker code. Full per-env isolation (separate Redis + `api-dev.himyro.com`) is documented but NOT built — see `docs/runbooks/railway-dev-main-env-split.md`.
- **Supabase: `gipvxuugajkugntwkeiz` — ONE DB, shared by both dev+prod backends + worker.** A dev-env test upload writes to prod Supabase. Single by design (see policy above).
- **#16 launch-capacity gate (measured 2026-08-13): BLOCKED.** The organization
  is on **Free** and the database is **Nano**: 1,118MB database size, 224MB
  `shared_buffers`, 60 `max_connections`, and 11 PostgREST authenticator
  sessions. Nano's recommended maximum DB size is 500MB. After all known read
  query, hop, payload, cache and journey fixes, one warm feed meets the 500ms
  backend target (477ms p95), but 10 simultaneous Market arrivals (20 reads)
  measure 2,161ms backend p95. Before launch: move the organization to a paid
  plan, select **Small compute or larger** (Micro keeps the 60-connection class),
  then rerun `backend/scripts/run_read_load_probe.py --scenario market_arrival`
  at 10 and 20 users. Acceptance is backend p95 <500ms and zero failures at
  both levels. This is a paid control-plane action; code agents must not claim
  it happened from a `Develop` push.
- **Release tier = `MYRO_ENV` (`sandbox` | `dev` | `prod`), set per Railway service.** It is the environment boundary; `RAILWAY_ENVIRONMENT` reads `production` on ALL five services (dev+prod deliberately share one Railway environment object) so it can never be the tier. Service-name inference survives as fallback only, and resolves anything unlabelled to `prod` (fail-safe). `backend/app/config.py: release_tier`.
- **CORS is a real exact allowlist (since `9116777f`), NOT a wildcard** — `ALLOWED_ORIGINS` is live config, `allow_credentials=False`, `install_cors` refuses `*`. **Prod = exact origins only.** **Dev additionally matches `PREVIEW_ORIGIN_REGEX`** (`^https://truemirror-[a-z0-9-]+\.vercel\.app$`) because Vercel mints a NEW origin per preview deployment — an exact list goes stale on every push to Develop, which is what silently broke the dev app for days until 2026-07-27. Production ignores the regex *structurally* (`Settings.cors_origin_regex` returns `""` when tier is prod), so it cannot leak by config mistake. Attach a new stable domain (e.g. `dev.himyro.com`) → add it to that tier's `ALLOWED_ORIGINS`.
- **Every deployed tier validates its own config at boot** (`validate_runtime_configuration`): Supabase present + at least one origin/pattern a browser can match. Sandbox exempt. Boot logs `boot tier=… origins=… preview_regex=…` on `uvicorn.error` — check that line first when an env "looks online but does nothing". **Contract smoke:** `python -m scripts.smoke_env_contract` (backend/) asks from outside whether each tier's frontend can reach its own backend + that foreign origins are still refused; CI runs it on push to Develop/main and daily.
- **DNS:** himyro.com on **GoDaddy**. `api` = CNAME → `rm336p0v.up.railway.app`; `_railway-verify.api` = TXT `railway-verify=<token>` (**single** prefix — a doubled `railway-verify=railway-verify=…` blocks cert issuance; cost real time 2026-06-03). Railway custom-domain cert needs BOTH records verified or it serves wildcard `*.up.railway.app` → TLS name mismatch → curl 000.
- **Railway mgmt = MCP** (`mcp__railway__*`). Pass **snake_case `service_id`** or reads default to the linked service. `remove_service` confirm-boolean is broken via MCP → final service deletion needs a dashboard click.
- **Cutover runbook:** fix DNS → wait cert green (`curl api.himyro.com/health` = 200, not 000) → THEN flip Vercel env + redeploy → verify → only then touch the old service. Flipping Vercel before cert live = outage.
- **LLM chain:** OpenRouter free llama → Groq llama-3.3-70b → Gemini flash-lite → OpenRouter paid.

---

## GOOGLE ONE TAP (FedCM) — code shipped, **config applied 2026-09-05**

**Done, and where it lives:** Google Cloud project **`myro-495307` ("Myro")**,
OAuth client **"Myro Web (One Tap)"** — a SECOND web client, created so the
live-login credential ("HiMyro Web") was never edited. Its ID is in Supabase →
Auth → Providers → Google → **Client IDs** (comma-separated, appended after the
existing one), and in Vercel as `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on all three
environments. Authorized JS origins: `https://himyro.com`,
`https://www.himyro.com`, `http://localhost:3000`, `http://127.0.0.1:3000`
(the loopback pair is for local dev — `127.0.0.1` has its own localStorage, so
it is the one origin where a signed-in developer can still see the prompt).
The consent screen is **In production / External**, so no test-user gate.

**Still owed:** production runs `main`, which does not have the One Tap code —
the Vercel variable does nothing on himyro.com until `Develop` is merged. And
the prompt has never rendered for a real Google account: Google warns settings
take "5 minutes to a few hours" to take effect, and a fresh client is silent
until then.

⚠️ **`Skip nonce checks` is ON in the Supabase Google provider.** It accepts an
ID token bearing any nonce. The One Tap code sends a real hashed/raw nonce pair
and does not need it — but it was on before this work and nothing here changed
it, because other clients (iOS) may rely on it.

### The original four steps, for reference

The account-chooser prompt (the dark popup listing Google accounts, the thing
Vercel shows) is built and **inert**: with no `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
the script never loads, the CSP is never widened, and the three auth surfaces
— `/login`, `/signup` and the sign-in modal the public pages open — render
exactly as they do today. Four steps turn it on, and only Shivam can do the
first three.

1. **Google Cloud console → Credentials**, in the SAME project as the Google
   provider Supabase already uses (its client ID is on the Supabase provider
   page — the project it belongs to is the right one). Either add origins to
   that existing **Web application** client, or create a new one
   (**Create credentials → OAuth client ID → Web application**). The consent
   screen must already be configured and **published** — while it is in Testing
   only listed test users ever see the prompt. Authorized JavaScript origins
   (no wildcards allowed):
   `https://himyro.com`, `https://www.himyro.com`, `http://localhost:3000`, plus
   any stable preview domain worth prompting on. No redirect URI is needed —
   One Tap returns the ID token in-page.
2. **Supabase → Authentication → Providers → Google → "Authorized Client IDs"**
   must list that web client ID. The One Tap path is `signInWithIdToken`, which
   validates the token's `aud` against this list — the existing OAuth redirect
   flow does not use it, so it is easy to miss.
3. **Vercel → env `NEXT_PUBLIC_GOOGLE_CLIENT_ID`** on both envs, then redeploy.
   `NEXT_PUBLIC_*` is baked at BUILD time — setting the variable without a
   redeploy changes nothing.
4. Nothing else. The CSP widens from the same variable
   (`middleware.ts` → `buildContentSecurityPolicy({ googleOneTap })`), adding
   only the four path-scoped `accounts.google.com/gsi/*` sources.

**Verify:** open `/login` in a Chrome that is signed into Google, in a normal
(not incognito) window. The prompt appears top-right; choosing an account lands
you signed-in via `/auth/callback` — the same finisher the redirect flow uses.

**Do not read absence of the prompt as a broken build.** Google applies an
exponential cooldown after a visitor dismisses One Tap (silenced for hours
after three dismissals), it never shows to a browser with no Google session,
and the code deliberately skips it for anyone already signed in and inside
in-app webviews, where FedCM does not run.

---
