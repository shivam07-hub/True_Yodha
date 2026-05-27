# Myro — Feature & Loop Registry
### Source of Truth · v1.0 · 2026-05-27

Generated from graphify run (3315 nodes / 6795 edges) + CLAUDE.md audit.  
**Update this doc** when shipping new features or retiring loops. Regenerate with `/graphify --update` then re-audit.

---

## THE MASTER CYCLE

```
Record Win (after 25-min forge session)
    ↓
Win saved → LLM extracts skill evidence
    ↓
cv_versions new baseline written (POST /cv/skill-edit)
    ↓
Async re-tag: parse_cv_text → record_cv_score (BackgroundTask)
    ↓
Myro Score ticks up (mirror_scores updated)
    ↓
XP granted (+30 win / +50 forge claim)
    ↓
Skill level advances (total_forge_minutes ÷ 25 = session count → LEVEL_THRESHOLDS)
    ↓
Job match % improves (job_matcher re-runs on next refresh)
    ↓
Better job cards → motivation for next 25-min session
    ↺ (loop)
```

---

## ALL RETENTION LOOPS

### Loop A — Daily Forge → Skill Progression
```
/forge open
→ start 25-min timer (forgeTimerStore Zustand + localStorage persist)
→ any-duration burst completes → total_forge_minutes accumulates
→ every 25 min cumulative = 1 session toward level-up
→ claim XP (+50) via charge_xp() SQL RPC
→ [PROPOSED] "Record a Win" prompt fires
→ win → CV bullet updated → async re-score
→ Myro Score ticks → motivation tomorrow
⟳
```

### Loop B — Win → CV → Score → Jobs
```
Record win (free text / voice premium)
→ LLM maps win text to skill evidence
→ POST /cv/skill-edit → new baseline_upload cv_version
→ BackgroundTask: parse_cv_text → record_cv_score
→ user_skills updated → job_matcher re-ranks
→ better matches visible on /jobs
→ user saves job → job_applications row
⟳
```

### Loop C — Save Job → Intel → Follow Company → Heatmap
```
User saves job (job_applications.status = 'pending')
→ company identified
→ user visits /intel (Intel/Market tab)
→ follows company (10 XP via charge_xp → followed_companies)
→ heatmap row appears (per-company useQuery, CV skills as cols)
→ skill demand signals visible
→ forge on high-demand skills → back to Loop A
⟳
```

### Loop D — Share → Referral → New User
```
User sees /skills score
→ taps ↗ share (Web Share API)
→ link → /profile/{ninja_name}
→ visitor sees ghost radar (logged-out)
→ signs up via ?ref=ninja_name
→ myro_ref cookie → user_profiles.referred_by_user_id
→ [v2] original user gets XP credit on welcome_xp_granted=TRUE + referred_by_user_id IS NOT NULL
⟳
```

### Loop E — Match Refresh → Upgrade CV → Better Matches
```
User refreshes matches (XP-gated)
→ low match % on job cards
→ /skills → skill card → "Edit CV pointer" or "Polish with AI"
→ new baseline cv_version written
→ async re-score → record_cv_score
→ refresh matches again
⟳
```

### Loop F — Win Recording → XP → Unlock Premium
```
Record win → +30 XP
→ XP balance grows
→ unlocks: match refresh / company follow / Polish with AI
→ user sees platform value
→ upgrades to premium (diary voice / Wispr flow-like)
⟳ (monetisation funnel)
```

### Loop G — Match → Tailor → Apply/Share → Outcome  🆕 PROPOSED (closes the hire loop)
```
Job match surfaced (Loop B/E)
→ user picks a job → "Tailor my CV for this" (factual reorder — never invent)
→ tailored cv_version written (kind=tailored_*, parented to baseline)  ← ALREADY LIVE in CV Hub
→ render tailored CV → PDF (Railway PDF API — ALREADY LIVE)
→ DELIVER:  apply via apply_url  +  [PROPOSED] recruiter / referral outreach
→ log outcome on job_applications (applied_at, channel, response)
→ response rate per CV variant → which bullets/angles convert
→ low response → re-tailor / forge the gap skill → Loop A/B
⟳
```
**Why this matters:** Loops A–F build the profile and surface matches but stop at "save job". The
payoff only lands when the user ships an application *and hears back*. Loop G is the missing closure.
The firecrawl_Supabase **Career Ops Agent** prototypes the match→tailor half (`--tailor` builds a
per-job CV from the same Supabase jobs); porting its 5-axis eval + `application_angle` into
`llm_ranker` (see `docs/MATCHER_COMPARISON_CAREER_OPS_VS_TRUEYODHA.md`) gives each tailored CV a
built-in "why apply" pitch. **Gap to build:** outcome capture (channel + response on
`job_applications`) and the recruiter/referral delivery leg (cf. the empty
`CV applier agent/Referral finder per company agent/` — intended home for recruiter discovery).

### How to make existing loops better (cross-cutting, from this audit)
- **Loop B/E (matches):** `job_matcher` already has the company-cap; the *eval* side is thin — upgrade
  `llm_ranker` to emit grade + Apply/Skip + angle so job cards motivate action, not just show a %.
- **Loop G (new):** every application is a labeled training signal. Capture response/no-response per CV
  variant → the data loop that tells users which framing wins. Highest-leverage unbuilt loop.
- **Deal-breakers** are implicit today; a first-class `user_profiles` field sharpens every match and
  every tailored CV.

---

## FEATURE SURFACE INVENTORY

### 1. CV Hub (`/cv`)
| Feature | DB / Store | Status |
|---|---|---|
| Upload PDF / text / LinkedIn | `cv_upload_jobs`, `cv_versions.source` | ✅ Live |
| 2-phase async upload | `cv_upload_jobs.status` (processing/done/failed) | ✅ Live |
| Idempotency (no double charge) | `cv_upload_jobs.idempotency_key` UNIQUE per user | ✅ Live |
| Tab-close resume | `localStorage["myro_cv_upload_job_v1"]` | ✅ Live |
| Scanned PDF guard | Phase-1: <80 non-ws chars → 422 before charge | ✅ Live |
| Orphan sweep | `sweep_stale_cv_upload_jobs` RPC on FastAPI boot | ✅ Live |
| Upload rate cap | 5/hr per user (`_enforce_user_upload_rate_limit`) | ✅ Live |
| Main CV (baseline) | `cv_versions` kind=`baseline_upload` | ✅ Live |
| Tailored versions | `cv_versions` kind=`tailored_*`, parented to baseline | ✅ Live |
| Commit graph (visual history) | `cv_versions.parent_version_id` chain | ✅ Live |
| Playground (per-job tailoring) | `?jobId=` query param, 2-pane editor | ✅ Live |
| Skill-edit (edit bullet per skill) | `POST /cv/skill-edit`, SE1–SE17 decisions | ✅ Live |
| Async recompute after edit | `cv_versions.recompute_finished_at`, polls 3s, cap 30s | ✅ Live |
| PDF preview + ATS audit | `?view=pdf`, `cv.downloadPdf` endpoint | ✅ Live |

### 2. Skills (`/skills`)
| Feature | DB / Store | Status |
|---|---|---|
| Domain radar (12 domains) | `compute_and_persist_score()` → `mirror_scores` | ✅ Live |
| Myro Score (0–100) | Aggregate across 10 domains | ✅ Live |
| Skill cards (level, gap, CV pointer) | `user_skills` table | ✅ Live |
| Skill levels L0–L5 | `user_skills.forge_sessions_count` ÷ LEVEL_THRESHOLDS | ✅ Live |
| Log-to-Forge CTA | Skill card → `/forge?skill=X` deeplink | ✅ Live |
| CV pointer inline edit | "Edit CV pointer" → skill-edit modal | ✅ Live |
| Polish with AI | LLM rewrite of CV bullet (XP-gated) | ✅ Live |
| `?skill=` deeplink | Opens domain accordion to skill | ✅ Live |
| ScoreRing hero | SVG ring + domain breakdown accordion | ✅ Live |
| WeaknessSpotlight | 3 lowest-scoring domains highlighted | ✅ Live |
| Share profile (↗) | Web Share API → `/profile/{ninja_name}` | ✅ Live |

### 3. Forge / Practice (`/forge`)
| Feature | DB / Store | Status |
|---|---|---|
| 25-min session timer | `forgeTimerStore` Zustand + `localStorage["myro-forge-timer-v1"]` | ✅ Live |
| Partial-burst continuation | `user_skills.total_forge_minutes` cumulative | ✅ Live |
| ForgeXpPill ambient widget | 3 states: idle/running/claim-ready, conic ring | ✅ Live |
| ForgeChip (4 states) | idle/cart/active/done on skill cards | ✅ Live |
| LevelDots (5-dot ladder) | fills bottom-up via pendingMinutes/25 | ✅ Live |
| XP on claim (+50) | `charge_xp` RPC | ✅ Live |
| Auto-resume last skill | `GET /users/me/forge/last-skill` | ✅ Live |
| Level-up on session count | LEVEL_THRESHOLDS in forge_service.py + level-thresholds.ts | ✅ Live |
| Cycle counter | Sessions in one login window | 🔮 Backlog v2 |
| Long-press dismiss | 600ms hold to dismiss mid-session | 🔮 Backlog v2 |
| Streak multiplier | ×1.25/×1.5/×2 XP on N consecutive cycles | 🔮 Backlog v2 |

### 4. Diary → "Record a Win" (PROPOSED REDESIGN)
| Feature | DB / Store | Status |
|---|---|---|
| Old diary entry (+30 XP) | `daily_logs`, `cart_skills JSONB` | ✅ Live (old UX) |
| **"Record a Win" prompt** | Triggered after forge claim | 🆕 Proposed |
| **Daily win prompts (5 rotating)** | See prompts section below | 🆕 Proposed |
| **Win → CV evidence extraction** | LLM parses win → skill bullets | 🆕 Proposed |
| **Win → Skill level contribution** | Win = evidence toward skill advance | 🆕 Proposed |
| **Win archive (searchable)** | `daily_logs` extended | 🆕 Proposed |
| **N wins → CV rewrite** | Every 5 wins → "refresh your CV pointer?" | 🆕 Proposed |
| **Voice-first (Wispr flow-like)** | Whisper transcribe → win text | 🔮 Premium |
| **Astrology sub-brand prompts** | Personalised by natal chart / moon phase | 🔮 Premium |

**Win prompts (rotate daily):**
1. "What's one thing you shipped, fixed, or improved today?"
2. "Describe a moment today where you used [skill X] — what happened?"
3. "What problem did you solve? How would you explain it to a recruiter?"
4. "What did you do today that your future self will thank you for?"
5. "Name one thing today that proves you're getting better at [domain]."

### 5. Job Matcher (`/jobs`)
| Feature | DB / Store | Status |
|---|---|---|
| Top job matches | `job_applications`, `job_matcher.get_top_matches` | ✅ Live |
| Match score (% skill overlap + LLM) | `job_skills` FK table | ✅ Live |
| Tiered overlap floor (3→2 fallback) | Activates if pool underfills | ✅ Live |
| Refresh matches (XP-gated, 50 XP) | `charge_xp` → refund on failure | ✅ Live |
| Exhausted pool signal | `outcome_kind` in refresh response | ✅ Live |
| Save job | `job_applications.status = 'pending'` | ✅ Live |
| Application stage tracking | `job_applications.status` (saved→offer/reject) | ✅ Live |
| Job card redesign | `JobCard.tsx` — Mission Control parity | ✅ Live |

### 6. Tracker (`/tracker`)
| Feature | DB / Store | Status |
|---|---|---|
| Pipeline Kanban (6 stages) | `job_applications.status` | ✅ Live |
| Company focus drawer | Opens `company-drawer.tsx` on company tap | ✅ Live |
| Stale-prompt (7-day) | `last_stage_changed_at` + bump RPC | ✅ Live |
| Duplicate stale cards (M33) | Bug — parked HIGH | 🐛 Parked |

### 7. Intel / Market (`/intel`, `/market`)
| Feature | DB / Store | Status |
|---|---|---|
| Skill × Company heatmap | Per-company `useQuery`, CV skills as columns | ✅ Live |
| Follow company (10 XP, cap 10, floor -30) | `followed_companies` table | ✅ Live |
| Top Movers | 7D/30D/90D window + sort + followed-only toggle | ✅ Live |
| Intel pane (public) | Job count stats, skill demand signals | ✅ Live |
| Self Focus strip | User skill demand vs market | ✅ Live |
| **Company page → live job listings** | `GET /companies/{name}/jobs`, JobRow grid, Save action | ✅ Live (2026-05-27) |
| Country → city cascade (P1 next session) | Reorder selects + reset city on country change | 🔴 Next session |
| Intel personalization from onboarding (P1) | Pre-populate `selectedCountry` from `target_location_country` | 🔴 Next session |
| Heatmap labels missing (M17) | Bug — parked HIGH | 🐛 Parked |

### 8. Share / Public Profile (`/profile/{ninja_name}`)
| Feature | DB / Store | Status |
|---|---|---|
| Ninja / Public Name (vanity slug) | `user_profiles.ninja_name` UNIQUE | ✅ Live |
| Domain Map (public radar) | 12-domain radar + score + tier — fully public | ✅ Live |
| Ghost radar (logged-out) | Outline radar, `+` icon → `/signup?ref=` | ✅ Live |
| OG image auto-gen | `app/profile/[ninja]/opengraph-image.tsx` | ✅ Live |
| Web Share API (↗) | Native share sheet → WhatsApp first on mobile | ✅ Live |
| Referral attribution | `myro_ref` cookie 30d + `referred_by_user_id` | ✅ Live |
| Job overlap rows (logged-in only) | Max 3 mutual saved jobs | ✅ Live |

### 9. Auth + Onboarding
| Feature | DB / Store | Status |
|---|---|---|
| Google OAuth | Supabase provider | ✅ Live |
| LinkedIn OAuth (identity + metadata) | `linkedin_oidc`, partner scopes granted | ✅ Live |
| Magic link (3/hr/IP rate-limit) | `magic_link_attempts` table + RPC | ✅ Live |
| Password (legacy) | Supabase | ✅ Live |
| In-app browser detection | UA-sniff → warning sheet | ✅ Live |
| Signup modal (global, one mount) | `useSignupGate` Zustand | ✅ Live |
| Onboarding 5-step flow | CV → Role → Companies → Ninja Name → Score | ✅ Live |
| Auto-ninja-name | `suggest_ninja_name()` from full_name → slug | ✅ Live |
| Target company setup in onboarding | `followed_companies` seeded at step 3 | ✅ Live |
| CV background upload during onboarding | `idle/running/done/failed` state machine | ✅ Live |
| 12 GA4 signup telemetry events | `lib/analytics.ts::signupEvents` | ✅ Live |

### 10. XP Economy
| Feature | DB / Store | Status |
|---|---|---|
| Welcome grant (3000 XP) | DB BEFORE INSERT trigger on `user_profiles` | ✅ Live |
| Forge claim (+50 XP) | `charge_xp` RPC | ✅ Live |
| Win / Diary entry (+30 XP) | `daily_logs` write | ✅ Live |
| Match refresh (cost varies) | `charge_xp` → `refund_xp` on failure | ✅ Live |
| Company follow (10 XP, floor -30) | `charge_xp` | ✅ Live |
| Polish with AI (XP-gated) | `use_xp_gate` hook | ✅ Live |
| XP Explainer Modal | One-time on first positive balance, `localStorage["myro_xp_modal_seen_v1"]` | ✅ Live |
| XP Gate Modal | `useXPGate` hook + `XPGateModal` | ✅ Live |
| Ledger (audit trail) | `xp_ledger` append-only table | ✅ Live |
| Atomic charge/refund | `charge_xp` / `refund_xp` SQL RPCs | ✅ Live |
| Refund-rate metric | Structured log: `"metric refund.fired action=…"` | ✅ Live |
| XP packs (premium purchase) | Billing/Settings, Razorpay | 🔮 Deferred |

### 11. Operations / Infrastructure
| Feature | DB / Store | Status |
|---|---|---|
| Railway auto-deploy (Develop) | `railway.toml` | ✅ Live |
| Vercel deploy (main → himyro.com) | Vercel project | ✅ Live |
| LLM chain fallback | OpenRouter free → Groq llama-3.3-70b → Gemini flash-lite → OpenRouter paid | ✅ Live |
| Aspiration retry (3× exp backoff) | `_retry_supabase()` in `scores_repository.py` | ✅ Live |
| Orphan CV job sweep on boot | `sweep_stale_cv_upload_jobs` RPC | ✅ Live |
| Health check CLI | `ops/tools/health-check/` | ✅ Live |
| Repo health CLI | `ops/tools/repo-health/` | ✅ Live |
| Deploy check CLI | `ops/tools/deploy-check/` | ✅ Live |
| Preview cleaner CLI | `ops/tools/preview-cleaner/` | ✅ Live |
| Brand guidelines validator | Pre-commit + CI via `check-contrast.mjs` | ✅ Live |

---

## STATE TRACKING MAP
> Where is what stored?

| Domain | Source of truth | Table / Store | How frontend reads |
|---|---|---|---|
| User identity | Supabase Auth | `auth.users` | JWT |
| Profile + XP | DB | `user_profiles` | `GET /users/me` → `dataKeys.profile()` |
| XP ledger | DB | `xp_ledger` | `GET /users/me/xp-ledger` |
| CV versions | DB | `cv_versions` | `GET /cv/versions` |
| CV upload status | DB | `cv_upload_jobs` | Poll `GET /cv/upload/status/{job_id}` |
| Skills | DB | `user_skills` | `GET /users/me/skills` |
| Myro Score | DB | `mirror_scores` | `GET /users/me/score` |
| Forge timer | Client | `forgeTimerStore` Zustand | `useForgeSession` hook |
| Forge session count | DB | `user_skills.forge_sessions_count` | via `/users/me/skills` |
| Forge total minutes | DB | `user_skills.total_forge_minutes` | via `/users/me/skills` |
| Wins / Diary | DB | `daily_logs` | `GET /users/me/daily-logs` |
| Job matches | DB | `job_applications` | `GET /jobs/matches` |
| Tracker stages | DB | `job_applications.status` | `GET /tracker` |
| Followed companies | DB | `followed_companies` | `GET /users/me/followed-companies` |
| Ninja name | DB | `user_profiles.ninja_name` | via profile |
| Referral | DB | `user_profiles.referred_by_user_id` + `myro_ref` cookie | cookie set on `?ref=` landing |
| XP modal seen | Client | `localStorage["myro_xp_modal_seen_v1"]` | one-time flag |
| CV upload resume | Client | `localStorage["myro_cv_upload_job_v1"]` | on `/cv` mount |
| Forge timer persist | Client | `localStorage["myro-forge-timer-v1"]` | Zustand persist middleware |

---

## OPEN BUGS IN LOOP CHAIN (HIGH)
> Issues that break loop integrity

| ID | Loop affected | Description |
|---|---|---|
| ~~Company dead-end~~ | ~~Loop C~~ | ~~Company page showed cold-start reviews ask~~ **FIXED 2026-05-27 commit `92168b9`** |
| M17 | Loop C (Intel) | Heatmap missing column/row labels |
| M31 | Loop C (Intel) | Autodesk appears twice in heatmap — UNIQUE constraint audit needed |
| **P1-Intel** | Loop C (Intel) | Country→city cascade missing. City filter not seeded from onboarding. **Next session.** |
| M33 | Loop E (Tracker) | Duplicate stale-prompt cards for same company |
| M13 | Loop B (CV) | Self Found row layout + 7× Cognizant dup in job cards |
| M25 | Loop B (CV) | Tailored CV titles render `Cognizant · Cognizant` |
| M30 | Loop B (CV) | `[Skip to main content](...)` scraper markdown leaking into LLM rationale |
| M01 | Loop B (Score) | Score evidence trace — users ask "where did this score come from?" |
| Backlog #14 | Loop E (Matches) | Match stuck at 2 for narrow CVs (pool exhausted, tiered floor fix landed but untested in prod) |

---

## HOW TO INVOKE THIS DOC

```
/graphify query "what features connect forge session to myro score"
```
Or reference directly: `docs/FEATURE_LOOP_REGISTRY.md`

To refresh after shipping new features:
1. `/graphify --update` → rebuilds graph
2. Edit this file with new rows

Graph source: `graphify-out/GRAPH_REPORT.md` + `graphify-out/graph.html`
