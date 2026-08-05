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
- **Release tier = `MYRO_ENV` (`sandbox` | `dev` | `prod`), set per Railway service.** It is the environment boundary; `RAILWAY_ENVIRONMENT` reads `production` on ALL five services (dev+prod deliberately share one Railway environment object) so it can never be the tier. Service-name inference survives as fallback only, and resolves anything unlabelled to `prod` (fail-safe). `backend/app/config.py: release_tier`.
- **CORS is a real exact allowlist (since `9116777f`), NOT a wildcard** — `ALLOWED_ORIGINS` is live config, `allow_credentials=False`, `install_cors` refuses `*`. **Prod = exact origins only.** **Dev additionally matches `PREVIEW_ORIGIN_REGEX`** (`^https://truemirror-[a-z0-9-]+\.vercel\.app$`) because Vercel mints a NEW origin per preview deployment — an exact list goes stale on every push to Develop, which is what silently broke the dev app for days until 2026-07-27. Production ignores the regex *structurally* (`Settings.cors_origin_regex` returns `""` when tier is prod), so it cannot leak by config mistake. Attach a new stable domain (e.g. `dev.himyro.com`) → add it to that tier's `ALLOWED_ORIGINS`.
- **Every deployed tier validates its own config at boot** (`validate_runtime_configuration`): Supabase present + at least one origin/pattern a browser can match. Sandbox exempt. Boot logs `boot tier=… origins=… preview_regex=…` on `uvicorn.error` — check that line first when an env "looks online but does nothing". **Contract smoke:** `python -m scripts.smoke_env_contract` (backend/) asks from outside whether each tier's frontend can reach its own backend + that foreign origins are still refused; CI runs it on push to Develop/main and daily.
- **DNS:** himyro.com on **GoDaddy**. `api` = CNAME → `rm336p0v.up.railway.app`; `_railway-verify.api` = TXT `railway-verify=<token>` (**single** prefix — a doubled `railway-verify=railway-verify=…` blocks cert issuance; cost real time 2026-06-03). Railway custom-domain cert needs BOTH records verified or it serves wildcard `*.up.railway.app` → TLS name mismatch → curl 000.
- **Railway mgmt = MCP** (`mcp__railway__*`). Pass **snake_case `service_id`** or reads default to the linked service. `remove_service` confirm-boolean is broken via MCP → final service deletion needs a dashboard click.
- **Cutover runbook:** fix DNS → wait cert green (`curl api.himyro.com/health` = 200, not 000) → THEN flip Vercel env + redeploy → verify → only then touch the old service. Flipping Vercel before cert live = outage.
- **LLM chain:** OpenRouter free llama → Groq llama-3.3-70b → Gemini flash-lite → OpenRouter paid.

---
