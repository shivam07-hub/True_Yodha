# Myro in Claude and ChatGPT

**Architecture spec #63. Implementation by Cursor. Written 2026-11-15 by Claude
from a code walk, prod reads and the vendors' docs.** Shivam, 2026-11-15: build an
MCP the way Suno has one.

> **VERIFY IN CODE before building.** Line numbers are from `1d9162d9`. One chunk
> = one commit on `Develop`, six gates green, `git add` only your own files.
> Four things below are read from docs, not proven. They are marked **UNPROVEN**.
> Gate G proves them. Nothing past Gate G is built until it passes.

---

## 1 · What this is

A person adds one address to Claude or ChatGPT and signs in with their Myro
account. The assistant can then show the jobs Myro judged for them, add a job
they paste, tailor their CV for it, and record that they applied. Same account,
same coins, same CV as the website. That is Suno's shape: a second door onto one
account.

| In chat, v1 | Not in chat, v1 |
|---|---|
| The judged list, best first, with the line that says why | Taking a CV. Myro judges nothing until the person confirms their skills, and that step lives on the website (`cv_workflow.py:120-126`) |
| Add a job from a link or pasted text | Handing over the file. The PDF is drawn from the page in the browser (`routers/cv/export.py:99-104`). Chat gets a link to the CV |
| The verdict on one job | Buying coins (#56 is not built) |
| Tailor the CV: 50 coins when it reworks a role, as on the web | |
| Accept the changes; record "I applied" | |

**Reach, measured 2026-11-15, own accounts excluded.** 1,105 people. 230 have a
CV with confirmed skills. 52 of those were active in the last 30 days. Those 230
are everyone v1 can serve on day one. A new person still starts on the website.

**Why build it while the loop leaks.** #62's leaks are screens: the tailor room
where 4 of 6 pressed nothing. Chat has no room. That is a guess, and §4 is how
we will know.

**Two doors, one adapter (Shivam, 2026-11-22: "spec + build").** A stranger who
finds Myro in the Claude directory has no Myro account, so a sign-in-only
connector meets them with "go to the website first". The **open door**
(`https://himyro.com/mcp/open`, no sign-in, §3A) answers what only Myro knows
about the market: live MNC roles, the skills a role or a company asks for, where
demand is, who leaves ads up. The **account door** (`https://himyro.com/mcp`,
M1–M7) does the person's own loop. Claude can already write a bullet and draft
interview questions; it cannot know which employers have the role open today.
In an assistant Myro sells the data, not the model. The open door ships first:
it needs no OAuth, so no Gate G, and it proves U4 with nothing at stake.

**UNPROVEN.**
- **U1.** Supabase Auth's OAuth 2.1 server (beta) issues tokens that Claude and
  ChatGPT accept through discovery and dynamic client registration.
- **U2.** Those tokens pass `deps._decode_local_jwt` unchanged (audience
  `authenticated`, asymmetric signature) and carry a `client_id` claim.
- **U3.** A `POST /cv/weave` keeps running after its caller stops waiting. A run
  may take 240 s (`paid_run.py:46`); a chat tool call cannot.
- **U4.** The MCP TypeScript SDK serves a stateless JSON handler from a Next 14
  route handler on Vercel. **O2 proves it.**
- **U5.** The directory lists a remote connector with no sign-in. Anthropic's
  submission page allows "no authentication for public data"; read 2026-11-22,
  not yet tried.

---

## 2 · Owners you reuse, never re-create

The adapter is a client of the API, like the website and the extension. It holds
no key and no database client. It forwards the caller's own bearer token to
`api.himyro.com` and shapes the answer. If a tool needs logic the API does not
have, the chunk is BLOCKED: say so, do not write the logic in the adapter.

| Question | The one owner | Do not |
|---|---|---|
| Who is calling | `backend/app/deps.py` `get_current_user` (:223) | verify a user anywhere else in the backend; give the adapter a Supabase key |
| What a chat token may reach | NEW `backend/app/security/oauth_client.py` (M1), called only from `deps.py` | per-route checks in routers; a permission list in the adapter |
| The judged list | `GET /jobs/feed` (`routers/jobs/list.py:450`) → `matching/published_list.assemble` | read `user_job_matches` or the shortlist; re-rank or filter |
| The line written to the reader | `pick_reason` (ADR-0024 §4) | return `summary`; write a line in the adapter |
| Reading a pasted job | `POST /jobs/import/extract-url`, `/extract-text`, then `POST /jobs/import` (`routers/jobs/apply.py:233-275`) | fetch the link in the adapter (the SSRF guard lives in `job_link_reader`); a second saver |
| The verdict on one job | `POST /jobs/{job_id}/brain` (`routers/jobs/match.py:284`) | wait on a model; call the judge |
| Tailoring | `POST /cv/weave` (:404), `GET /cv/weave/{job_id}` (:373), `POST /cv/weave/apply` (:524) in `routers/cv/weave.py` | compose a CV in the adapter; add a CV kind |
| The price | `xp_policy.CV_WEAVE_XP_COST`, charged inside `weave.py` `_claimed_run` | charge, refund or quote a different price in chat |
| "I applied" | `PUT /jobs/applications/{job_id}` (`apply.py:359`, `application_yes.say_yes`) | write `job_applications` any other way |
| CV and skills state | `GET /onboarding/checklist` (`routers/onboarding.py:335`) | read `cv_versions` to decide it |
| Loop steps | `core_loop.record_step` with surface `"mcp"` | a new step name; a tool-call table |
| The consent screen's look | `frontend/app/connect/[partner]/page.tsx` | a new visual language |
| API response types | `frontend/lib/api.ts`, type-only imports | re-declare them; import its browser client |

---

## 3 · The chunks

```text
Claude / ChatGPT
   │  POST https://himyro.com/mcp            Next route handler, no keys
   ▼
https://api.himyro.com/...                   same bearer token, routers as today

Sign-in: /.well-known/oauth-protected-resource → Supabase Auth OAuth server
         → https://himyro.com/oauth/consent → token for that person
```

Four lanes. Lanes do not share files. Inside a lane, run the chunks in order.

| Lane | Chunks | Files it owns |
|---|---|---|
| A · API fence | M1 | `app/deps.py`, `app/security/oauth_client.py`, one migration, `routers/jobs/list.py:468`, `routers/cv/weave.py:512` |
| B · consent | M2 | `frontend/app/oauth/consent/*`, `frontend/lib/mcp/trusted-clients.ts`, `scripts/reach-allowlist.json` |
| C · adapter | M3 → M4 → M5 → M6 → M7 | `frontend/app/mcp/route.ts`, `frontend/app/.well-known/oauth-protected-resource/route.ts`, `frontend/lib/mcp/*` (not `trusted-clients.ts`), `frontend/middleware.ts` matcher |
| D · door | M8 | `frontend/app/ai/*`, the links to it, `frontend/app/llms.txt/route.ts` |

**Against #62.** M1 and R3 both edit `routers/jobs/list.py`, different lines:
rebase before you commit. M4 needs R3 on `Develop` (the feed row must carry
`pick_reason`). Nothing else is shared.

**Tool rules, every tool.** Name starts `myro_`. Input is a zod schema with a
description per field. Output has a schema. Set all four annotations
(`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`). An API
error becomes a tool error that says what to do next, never a throw. Return
only what the website shows the reader. Never return job-description text: it is
a stranger's writing going into the person's assistant.

### M1 · The API knows a chat token and fences it

**Why.** Supabase hands a chat client an ordinary user token. With no fence that
token can call every route: delete the account, read payments.

**Do.**
1. `_LocalIdentity`, `CurrentUser` and `Principal` gain
   `oauth_client_id: str | None`, read from the token's `client_id` claim.
2. `security/oauth_client.py` holds `ALLOWED`, a frozen set of (method, route
   template) pairs: exactly the routes named in M3–M7. `get_current_user` calls
   it when `oauth_client_id` is set. A route off the list answers 403.
3. Same module: a per-person Redis counter for chat tokens, built like
   `partner_auth._enforce_rate_limit` (fails closed in production). 60 calls a
   minute. `POST /jobs/import*`: 10 an hour, because each one costs Myro a model
   read.
4. A token that carries `client_id` and cannot be verified locally is refused.
   It never takes the remote fallback, which drops the claim the fence reads.
5. Surfaces. `list.py:468` records exposures as `"mcp"` for a chat token,
   `"market"` otherwise. `weave.py:512` records `weave_ran` as `"mcp"`,
   `"mentor"` otherwise. Migration (additive): add `'mcp'` to
   `job_recommendation_exposures_surface_check`.

**Do not.** Add scopes, a second token type, or checks inside routers. Change
anything for a token with no `client_id`: the website and the extension must
behave exactly as today.

**Tests.** No `client_id`: unchanged on a listed and an unlisted route. With
`client_id`: a listed route passes; account delete and payments answer 403;
unverifiable answers 401; the 61st call in a minute answers 429. Every `ALLOWED`
entry matches a real route in `app.routes`, so a renamed route fails the test,
not the person.

**Done when.** The tests, and the migration read back in SQL.

### M2 · The consent page

**Why.** Supabase sends the person to the Site URL plus the authorization path
with an `authorization_id`. Myro's page shows who is asking and takes the yes.

**Do.**
1. `app/oauth/consent/page.tsx`. Signed out: the existing login, returning here
   with `authorization_id` kept (see how `/extension/connect` returns).
2. `supabase.auth.oauth.getAuthorizationDetails(id)` (the installed
   `@supabase/auth-js` 2.102.1 has it), then show the client's name and the
   host it will return to. Allow calls `approveAuthorization`;
   the other button calls `denyAuthorization`. Follow the redirect each returns.
3. The page states three facts, in the reader's words: the assistant sees your
   jobs and CV lines; it can tailor your CV with your coins; it can record that
   you applied.
4. `lib/mcp/trusted-clients.ts`: the callback hosts of Claude and ChatGPT,
   taken from each vendor's connector docs on the day you build. Any other host
   gets no Allow button.
5. `reach-allowlist.json` `external`: "/oauth/consent — entered by Supabase Auth
   redirect". Run `/frontend-design` and `/ux-copy`. 375px.

**Do not.** Approve without a click. Add a second login. Store a token.

**Tests.** Unknown host: no Allow. Known host: Allow approves, the other denies.
Signed out: login keeps `authorization_id`.

### M3 · The adapter, with one tool

**Do.**
1. `app/.well-known/oauth-protected-resource/route.ts`: the RFC 9728 document.
   `resource` is `https://himyro.com/mcp`; `authorization_servers` is
   `{NEXT_PUBLIC_SUPABASE_URL}/auth/v1`.
2. `app/mcp/route.ts`: POST only, stateless, JSON responses, no sessions. The
   official MCP TypeScript SDK, current stable line, exact version pinned.
   Server name `myro`.
3. No bearer, or one that fails signature or expiry against Supabase's public
   JWKS: 401 with `WWW-Authenticate: Bearer resource_metadata="…"`. If the
   project still signs with HS256, stop: §6 item 2 comes first. The adapter
   never holds the JWT secret.
4. `lib/mcp/api.ts`: one `call(token, method, path, body)` to
   `NEXT_PUBLIC_API_URL` with a timeout. It maps 402 (coins, with the balance
   and `/tokens`), 409 (no CV, with `/onboarding`), 429 (wait) and 5xx into tool
   errors.
5. Tool `myro_get_status` (read-only): `GET /onboarding/checklist`,
   `GET /users/me/xp`, `GET /jobs/collections` → `{has_cv, skills_confirmed,
   coins, jobs_by_stage, next: {text, url}}`. Run `/read-path-perf` on the three
   reads first.
6. `middleware.ts` runs on every path and redirects nobody today. Confirm a
   POST to `/mcp` and a GET to `/.well-known/` pass through it untouched;
   change the matcher only if they do not.
7. Set `maxDuration` from the Vercel plan this project is on. Write the number
   in the commit.

**Do not.** Keep anything about a person in module scope (instances serve many
people). Log a token or a CV line.

**Tests.** No token: 401 and the header. `tools/list` returns the tool with its
annotations. Status in three states: no CV, CV unconfirmed, ready. API 5xx
becomes a tool error.

**Done when.** MCP Inspector against the Vercel preview gets the 401, reads the
metadata document and lists the tool.

### Gate G · One real sign-in, both assistants (Shivam + Claude)

Not a Cursor chunk. After M1–M3 are on `main`, Shivam does §6 items 1–3. Claude
then connects the QA account from Claude and from ChatGPT, calls
`myro_get_status`, and writes here: the token's audience, algorithm, `client_id`
and lifetime (U1, U2), the `auth.oauth_consents` row, and a 403 from an unlisted
route with that token. `/security-review` runs on M1–M3 first.

Pass: both assistants finish sign-in and the tool returns the QA account's own
state. Fail: stop and write what failed. §7 names the fallbacks.

### M4 · The list and the verdict

**Needs.** Gate G. #62 R3 on `Develop`.

**Do.**
1. `myro_list_jobs(limit ≤ 20, default 10; offset)`: `GET /jobs/feed`. Per job:
   `job_id, title, company, location, work_mode, score, grade, recommendation,
   why, verdict, url`. `why` is `pick_reason` or null. Plus `total`, `has_more`,
   `next_offset`. Order is the feed's order.
2. `myro_get_verdict(job_id)`: `POST /jobs/{job_id}/brain`. `available: false`
   becomes `{status: "checking", retry_after_seconds: 20}`. Otherwise the
   fields `components/jobs/myro-take.tsx` shows the reader, and no others.

**Do not.** Return `summary` under any name. Sort or filter beyond limit and
offset.

**Tests.** `summary` is absent from the output even when the API sends it. Null
`pick_reason` gives `why: null`. Paging. A `checking` row stays `checking`.

**Done when.** In Claude, the QA account asks for its jobs and gets /market's
top rows in /market's order. SQL shows exposure rows with surface `mcp`.

### M5 · Add a job

**Do.** `myro_add_job`, exactly one of `url` or `text`. Extract
(`/jobs/import/extract-url` or `/extract-text`), then `POST /jobs/import`.
Return `{job_id, title, company, verdict: "checking"}`. Read `JobImportRequest`
for what `source_platform` accepts; if `"mcp"` needs a constraint change, that
is an additive migration in M1's lane, not a workaround here.

**Do not.** Skip the save: a pasted job exists only as its saved snapshot
(`job_history.listing_document`), so unsaved it cannot be judged or tailored.
Take a list of jobs in one call.

**Tests.** Both inputs, neither, both. A 422 from the reader becomes "paste the
job text instead".

**Done when.** A QA paste in ChatGPT leaves one `job_applications` row and, a
minute later, a verdict from `myro_get_verdict`.

### M6 · Tailor in chat

**First, U3.** On dev with the QA account, start `POST /cv/weave` and drop the
connection at 5 s. Later, `GET /cv/weave/{job_id}` must show `purchased: true`
and the ledger exactly one `cv_weave` row. If the run died with its caller,
this chunk is BLOCKED: the weave moves to the worker first, as its own spec.

**Do.**
1. `myro_tailor_cv(job_id, redo = false)`: `POST /cv/weave`. Wait at most 25 s.
   Done: the shaped proposal. Not done, or 409: `{status: "drafting",
   retry_after_seconds: 20}`. Its description says it may use 50 Myro coins and
   to tell the person first.
2. `myro_get_tailoring(job_id)`: `GET /cv/weave/{job_id}`, same shape, plus
   `weaving`, `applied`, `stale`.
3. Shape: `cost_charged, coins_left, summary, skills_line`, and per changed role
   `role_index, role, company, edit_kind, why, before, after, dropped_lines`.
4. `myro_apply_tailoring(job_id, accept_roles, accept_summary, accept_skills_line)`:
   `POST /cv/weave/apply` in its take-all form. Every accept defaults to nothing.
   Return `{version_id, cv_url}` where `cv_url` is `https://himyro.com/cv?jobId=…`,
   the page that holds Download and Apply.

**Do not.** Apply in the same call as tailor. Accept a role the person did not
name. Pass `redo` when the cached proposal is not stale.

**Tests.** Shaping. Timeout gives `drafting`. 402 carries the balance. Apply
with no arguments accepts nothing.

**Done when.** The QA account tailors a never-tailored job in Claude and accepts
one role. SQL: a `cv_versions` row with that `job_id`, `kind = 'deterministic'`;
`weave_ran` with surface `mcp`; one ledger row. `/cv?jobId=` shows the lines.

### M7 · "I applied"

**Do.** `myro_mark_applied(job_id)`: `PUT /jobs/applications/{job_id}` to
`applied` (read the request model for the body). Idempotent. Its description:
only when the person says they submitted on the company's own site.

**Done when.** SQL: the application is `applied` and the server wrote the
`applied` step.

### M8 · The door

**Needs.** M4–M7 verified. Do not advertise a thing that does not work yet.

**Do.** A public page `/ai`: what it does, the address `https://himyro.com/mcp`
with a copy control, the steps for Claude and for ChatGPT, what it cannot do.
Link it from the site footer and from Settings. Add one line to `llms.txt`.
`/frontend-design`, `/ux-copy`, 375px.

**Done when.** `check:reach` is green on real links, and the commit states the
reach number: how many of the 230 opened a surface that links to `/ai` in the
last 30 days.

---

## 3A · The open door — no sign-in

```text
Claude / ChatGPT  ──POST https://himyro.com/mcp/open──►  Next route handler
                                                         │ holds ONE server env key:
                                                         │ MYRO_MCP_OPEN_KEY (partner key,
                                                         │ scope market.read, revocable)
     anonymous reads ◄──────────────────────────────────┤
     /companies/* · /jobs/skill-demand · /public/*      │
     keyed reads ◄──────────────────────────────────────┘
     /partner/v1/market/*  (Redis limiter, fails closed in prod)
```

**Why a partner key.** Every chat on claude.ai reaches the adapter from
Anthropic's servers, and the adapter reaches the API from Vercel's: a per-IP
limit would be one bucket shared by every stranger. The keyed reads are a
partner integration whose partner is Myro itself: `partner_auth` already
counts per key in Redis, fails closed in production, revokes in one command,
and stamps last use. The same scope is §7's data product for other companies'
AI. One API, the open door its first client. The key is not a Supabase key and
reaches no user's data.

**What it never returns.** Job-description text (a stranger's writing going
into the person's assistant), anything about a person, or a Myro verdict (that
needs a CV). Every job carries `tailor_url`, `https://himyro.com/cv?jobId=…`:
the page `/intel` already sends a visitor to, which holds tailor, Download and
Apply on the employer's page. Handing over the employer's link would skip the
CV the loop exists to make. Every Myro link carries `utm_source=mcp`
(`lib/attribution.ts` reads it).

### O1 · The API answers two market questions it could not

**Do.**
1. `partner_auth.SCOPE_MARKET_READ = "market.read"`, in `ALL_SCOPES`.
2. `routers/partner/market.py`, both behind `require_scope(SCOPE_MARKET_READ)`:
   - `GET /partner/v1/market/jobs?role=&city=&country=&mode=&limit≤20` →
     `FilterSpec(roles=(role,), …)` → `JobQuery.public`. The landing search
     without its model parse: the assistant is the parser. Same rows, same
     `relaxed`.
   - `GET /partner/v1/market/role-skills?role=&limit≤5` → role families whose
     NAME matches every word of `role` by prefix (`product manager` finds
     Product Management), catch-all families excluded, most open roles first,
     each with `open_roles` and its twelve `core_skills` from
     `role_family_labels`. The `label` column is one sample job title, not a
     name: never return it.
3. Mint the key: `scripts/partner_admin.py`, partner `myro-mcp`, scope
   `market.read` only. Shivam puts it in Vercel as `MYRO_MCP_OPEN_KEY`.

**Do not.** Rank, filter or score in the router. Read a person. Meter
deliveries: this is not the paid feed, `roles.read` is.

**Tests.** No key 401; a key without the scope 403; shaping of both routes;
`label` absent; a word that matches no family gives `families: []`, not a 404.

### O2 · The adapter, six read-only tools

`app/mcp/open/route.ts`: POST only, stateless, JSON responses, official SDK
pinned exact. Server name `myro-market`. Every tool `readOnlyHint: true`,
`destructiveHint: false`, `openWorldHint: false`, a `title`, an output schema.
Errors say what to try next.

| Tool | Reads | Answers |
|---|---|---|
| `myro_search_jobs(role, city?, country?, work_mode?, limit?)` | `/partner/v1/market/jobs` | live roles at named employers, first seen, `tailor_url` |
| `myro_skills_for_role(role)` | `/partner/v1/market/role-skills` | the skills listings for that role ask for, and how many are open |
| `myro_company_profile(company)` | `/companies/{name}/skill-intelligence`, `/companies/{name}/jobs` | what one employer asks for and has open |
| `myro_skill_demand(city?)` | `/jobs/skill-demand`, `/jobs/skill-demand/cities` | the most-asked skills in a city; with no city, the cities we cover |
| `myro_hiring_by_sector()` | `/public/hiring-panel` | which sectors are hiring, largest live pool first |
| `myro_ghost_jobs(company?)` | `/public/ghost-index` | which employers leave ads up after hiring |

**Do not.** Hold a person in module scope. Log a query. Return a page the size
of the index: `myro_ghost_jobs` returns the coverage block, the overall rate
and at most 20 employers.

**Tests.** `tools/list` with annotations; each tool's shaping with a fake
fetch; 404 becomes "no company by that name, try …"; 5xx becomes a tool error.

**Done when.** MCP Inspector against local dev lists six tools and each returns
real rows.

### O3 · The door page

`/ai`: the address with a copy control, the steps for Claude and ChatGPT, what
it answers, what needs the website. Footer and Settings link to it;
`llms.txt` gains one line; the privacy page gains one line. M8 later adds the
account door to the same page. `/frontend-design`, `/ux-copy`, 375px.

### O4 · The directory (Shivam's hands, Claude prepares)

Portal `claude.ai/directory/manage`, a paid plan's Owner. Slug `myro` is
permanent. Needs: docs URL (`/ai`), privacy policy, support contact, icon, use
cases, data-handling answers, seven acknowledgments, every tool run once as a
custom connector. Lists as Community; Anthropic may raise it to Verified. Read
the Software Directory Policy on scraped data before submitting.

### P1 · The skills plugin

Skills are not listed alone: they ship in a plugin from a public GitHub repo
(`.claude-plugin/plugin.json`, `claude plugin validate`), which points at the
connectors' URLs. Skills carry the method, never data: `find-my-next-job`,
`skills-gap-for-role`, `spot-ghost-jobs`, `market-brief` (open door);
`tailor-cv-for-job`, `interview-prep` (account door, after M7).

---

## 4 · Re-measure, weekly after Gate G

No new tables. Own accounts excluded.

- **Connected:** distinct people in `auth.oauth_consents`.
- **Listed:** distinct people with an exposure on surface `mcp`.
- **Tailored in chat:** `weave_ran` on surface `mcp` followed by a `cv_versions`
  row for that person and job.
- **Applied:** the `applied` step on a job with a chat weave.
- **Against the web, same week:** of people who started a tailor (web
  `card_tailor` or `panel_tailor`; chat `weave_ran` on `mcp`), how many left a
  `cv_versions` row. Web baseline: 0 tailors since 2026-11-03.

§7 is specced only from these numbers.

---

## 5 · Status

Cursor builds, Claude verifies. Cursor writes "Built {date}"; only the verify
pass writes "Verified".

| Chunk | State |
|---|---|
| O1 | Claude builds, 2026-11-22. |
| O2 | Claude builds, 2026-11-22. Needs O1 and the key in Vercel. |
| O3 | Spec only. Needs O2. |
| O4 | Spec only. Needs O3 on `main`. Shivam submits. |
| P1 | Spec only. Open-door skills after O4; account skills after M7. |
| M1 | Spec only. |
| M2 | Spec only. |
| M3 | Spec only. |
| Gate G | Waits on M1–M3 on `main`, then Shivam (§6). |
| M4 | Spec only. Needs Gate G and #62 R3. |
| M5 | Spec only. Needs Gate G. |
| M6 | Spec only. Needs Gate G. U3 first. |
| M7 | Spec only. Needs Gate G. |
| M8 | Spec only. Needs M4–M7 verified. |

---

## 6 · Handing a chunk to Cursor, and Shivam's list

Paste into a fresh Cursor chat, changing the chunk id:

```text
Read CLAUDE.md, then ARCHITECTURE_MCP.md in full. Build chunk M1 only, under the ten numbered rules in ARCHITECTURE_RETENTION.md section 6. Those rules name sections 2, 3 and 5: read them as this file's sections 2, 3 and 5.
```

**Order.** O1 → O2 → O3 → O4 first: no sign-in, so nothing waits on Gate G.
M1, M2 and M3 can run beside them in three chats. Then Gate G. Then
M4 → M5 → M6 → M7 in one chat at a time, then M8.

**Shivam's list (not agent work).**
1. Supabase → Authentication → OAuth Server: turn it on, set the authorization
   path to `/oauth/consent`, allow dynamic client registration. Only after
   M1–M3 are on `main`; before that the sign-in lands on a missing page.
2. Supabase → Authentication → signing keys: an asymmetric key is the one in use.
3. Supabase → Authentication → URL configuration: Site URL is `https://himyro.com`.
4. Privacy page: one line saying an assistant you connect receives the jobs and
   CV lines you ask it for.
5. Later, if the numbers earn it: ask Claude's and ChatGPT's directories to list
   Myro. Each runs a review.

**Cost.** No new server: the adapter runs in the Vercel project that serves the
website. Supabase's OAuth server is free while it is in beta; its price after
that is not published.

---

## 7 · Not in v1

Each of these waits on §4's numbers or on a call from Shivam.

- **A CV in chat.** `POST /cv/text` (`routers/cv/upload.py:147`, 200 coins),
  then the person confirms their skills. Chat must show the skills and take a
  yes. It never confirms for them.
- **The interview.** `/cv/weave/interview` and `/answer` feed `answers` to the
  weave. A natural fit for chat.
- **The file in chat.** Needs a server render of a CV version. Today the visible
  CV is chosen in the browser (ADR-0020), so a server render would be a second
  definition of it.
- **Buying coins in chat.** After #56.
- **Data tools for partners (Lightcast's shape).** Same server, a partner key in
  place of a person's sign-in. Owners exist: `partner_auth.require_scope`,
  `SCOPE_ROLES_READ`, `/partner/v1/roles`. Spec it when a buyer asks.
- **If Gate G fails.** U1 or U2: a small Python adapter as its own service, or
  an OAuth proxy in front of Supabase. U4: the same Python adapter. Neither is
  specced; a failed gate is a new decision.

**Known and accepted for v1.** At the API a chat token is fenced (M1). At the
database it is not: row-level security treats it as the person. Only a client
whose callback host is on M2's list can get one.
