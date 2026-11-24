# Myro in the Claude directory — submission pack (#63 O4)

Everything the portal asks for, in its order, ready to paste. Shivam submits;
Claude prepared it on 2026-11-24 from the portal docs and the Software
Directory Policy as they read that day. Spec: [ARCHITECTURE_MCP.md](ARCHITECTURE_MCP.md) §3A, O4.

Portal: **claude.ai/directory/manage** → Submit new → MCP connector.

---

## 0 · Before you open the portal

1. **Merge `Develop` into `main`.** The form's documentation link must be
   live. Production still lacks the `/ai` page (`763f0754`), the privacy lines,
   and the title match (`e557379e`). Check: `https://www.himyro.com/ai` opens.
2. **Use a paid Claude plan** (Pro, Max, Ultra, Team, Enterprise; Free cannot
   submit). On Team or Enterprise, an Owner submits. The listing belongs to
   that account's organization for good, so submit from the one that should
   own Myro's listing.
3. **Add Myro as a custom connector and run every tool once** (the portal asks
   you to confirm this). Claude: Customize → Connectors → + Add → Add custom
   connector → name `Myro`, URL below, **No sign in** → Add. Then in a chat:
   + → Connectors → turn Myro on, and send the six prompts in §4. Each should
   answer with real rows; none should say "cannot serve".

---

## 1 · Connection

| Field | Value |
|---|---|
| Server URL | `https://www.himyro.com/mcp/open` |
| Users connect to different URLs | No (one public URL) |

Use the `www` host: the bare `himyro.com` answers 307 to it.

## 2 · Tools (auto-synced; all six read-only, each with a title)

| Tool | Title |
|---|---|
| `myro_search_jobs` | Search live jobs |
| `myro_skills_for_role` | Skills a role asks for |
| `myro_company_profile` | Company hiring profile |
| `myro_skill_demand` | Skills in demand by city |
| `myro_hiring_by_sector` | Hiring by sector |
| `myro_ghost_jobs` | Ghost job index |

## 3 · Listing

| Field | Value |
|---|---|
| Server name | `Myro` |
| One-liner (180/200) | Live hiring data for India, read from employers' own careers pages: who is hiring for a role, the skills it asks for, demand by city and sector, and ads left up after a job closes. |
| Categories (1–5) | Pick from the portal's list: careers or jobs first, then data or research. |
| Documentation URL | `https://www.himyro.com/ai` |
| Privacy policy URL | `https://www.himyro.com/privacy` |
| Support contact | `hello@himyro.com` |
| Icon | `frontend/public/brand/icon-512.png` (512×512 PNG, the Myro mark) |
| URL slug | `myro` — **permanent once published** |

**Description (990/2,000):**

> Myro reads job listings from employers' own careers pages across India every day and answers questions about them in plain words.
>
> Ask who is hiring for a role in a city, and Myro returns live roles with the company, city, work mode and the day it first saw each one. Ask what a role asks for, and it returns the skills most often listed by matching job families, with how many roles are open. Ask about one employer and see the skills its live listings ask for, which are rising or falling, and how many roles it has open. You can also compare skill demand between cities, see which sectors are hiring most, and check the Ghost Job Index: how often an employer keeps advertising a role after its own careers site has closed it.
>
> Every tool is read-only and needs no sign-in. Answers are facts about listings: never a job description's text, and nothing about a person. Each job links to its page on himyro.com, where you can tailor a CV to it, download it and apply on the employer's site.

## 4 · Use cases

**Example prompts** (the policy asks for at least three; these are also your
test script in §0):

1. Who is hiring product managers in Bengaluru right now?
2. What skills does a data scientist role ask for?
3. What is Deloitte India hiring for, and which skills are rising there?
4. Which skills are most asked for in Mumbai this month?
5. Which sectors in India are hiring the most?
6. Which employers keep job ads up after the role has closed?

| Field | Answer |
|---|---|
| What users need before connecting | Nothing. No account, no plan, no setup beyond adding the URL. |
| Reads, writes, or both | Reads only. |

## 5 · Company

| Field | Value |
|---|---|
| Company name | *Shivam: the legal name the listing should show* |
| Company website | `https://www.himyro.com` |
| Primary contact for review | *Shivam: the address that should get reviewer mail* |

## 6 · Authentication

No sign-in. Every tool answers without authentication (public data). Leave the
OAuth client fields empty.

## 7 · Data handling

| Question | Answer |
|---|---|
| Whose API does it call | **Our own.** The connector calls only Myro's API (`api.himyro.com`). |
| Personal health data | No. |
| Sponsored content | No. |

If a reviewer asks where the data comes from: Myro's own crawler reads job
listings from employers' public careers pages. The connector returns facts
about a listing (title, company, city, work mode, first-seen day) and
aggregates (skill counts, sector totals, ghost-ad rates). It never returns a
job description's text or the employer's link; every link points to
`himyro.com`.

## 8 · Test & launch

Tick "ran every tool" only after §0.3. No credentials go in the portal (there
are none). For a Verified review, a reviewer may email for test access: none
is needed, the URL is public.

## 9 · Compliance — the seven acknowledgments, and the fact behind each

| Acknowledgment | Why Myro can tick it |
|---|---|
| Directory guidelines | Audited below against every policy rule. |
| First-party API usage | The connector calls only Myro's own API. |
| Financial transactions | None. No tool moves money or takes payment. |
| AI media generation | None. No image, audio or video. |
| Prompt injection | Tool descriptions state what each tool returns and hold no instructions beyond retrying the same tool. Outputs are typed data fields. |
| Conversation data collection | A tool receives only its own arguments (a role, a place, a company). Those appear only in the hosting provider's request logs, which the privacy policy states (§02 D, §05). |
| Public documentation | `https://www.himyro.com/ai`. |

## 10 · After submit

Listed as **Community** by default after an automated scan. Anthropic may
escalate it to **Verified** (a reviewer runs each tool). No fixed review time;
track it in the portal. Questions: `mcp-review@anthropic.com`. Any later change
to tools, tool descriptions or data practices is a "material change" to report
(policy 3H) and may be re-reviewed.

---

## Policy audit (Software Directory Policy, read 2026-11-24)

| Rule | How Myro meets it |
|---|---|
| 1A–B Usage Policy, high-risk areas | Market data only. Nothing decides on a person; no tool judges a CV. |
| 1D–E Privacy; no extraneous data, even in logs | Tools receive only their arguments. Request logs keep the URL; nothing else is stored. |
| 1F Intellectual property | Facts and aggregates only. No job-description text is returned. |
| 1G No reading Claude's memory or chats | Not possible: the connector only receives tool arguments. |
| 2A–B Narrow, accurate descriptions | Each says what it returns and what an empty or null field means. |
| 2C–E No conflict with, or steering to, other software | No tool names another server. |
| 2F–G No remote or hidden instructions | None. |
| 3A Privacy policy covering collection, use, retention | `/privacy` §02 D and §05. |
| 3B Support contact | `hello@himyro.com`. |
| 3C Documentation and troubleshooting | `/ai`. |
| 3D Test account with sample data | Not applicable: public, no account. |
| 3E At least three example prompts | Six, §4. |
| 3F Own or control every endpoint and resource | The connector reaches only `www.himyro.com` and `api.himyro.com`; every returned link is `himyro.com`. |
| 4A–E Unsupported uses | No payments, media, ads, adult content or evasion. |
| 5A Helpful errors | Timeouts, limits and unknown names say what to do next (an unknown company returns close names). |
| 5B Frugal with tokens | Jobs default 10 (max 20), 15 skills, ghost employers capped at 20. |
| 5C Tool names ≤ 64 characters | Longest is 21. |
| 5E Annotations | Every tool: `title`, `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`. |
| 5F Streamable HTTP | Yes (stateless, JSON responses). |

## Known limits a reviewer may hit

- **The first answer after a quiet minute can take 1–6 s** (cold database
  cache on Micro compute; ARCHITECTURE_READ_PATH.md §34). Warm answers take
  tens of milliseconds.
- **Search and role skills share one partner key** at 600 requests a minute
  across all users. The four other tools have no per-key limit.
- **Coverage is India-first.** Roles outside India are thin.
