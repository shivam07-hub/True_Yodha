# Mirror — Frontend

Next.js 14 (App Router) · Tailwind CSS · shadcn/ui · TanStack Query · Zustand

---

## Pages

| Route | Nav Label | Description |
|-------|-----------|-------------|
| `/cv` | CV | Upload CV (PDF/DOCX), view extracted skills grouped by Lightcast domain, evidence toggle, upload history score timeline |
| `/dashboard` | Dashboard | Domain Breakdown radar chart **+** Skill Intelligence panel side-by-side (lg:grid-cols-2); Top 5 Skills to Upgrade below |
| `/tracker` | Jobs | Jobs Tracker — top 5 matched jobs with application status (pending → applied → interviewing → offer/rejected) |
| `/market` | Intel | Market intelligence — skill demand, trending roles |
| `/diary` | Diary | Daily skill diary — free-text entry → XP awarded per skill |
| `/onboarding` | — | Step flow: CV upload → role selection → Mirror Score reveal |
| `/mission` | — | About + mission statement |
| `/jobs` | — | Full job list with search/filter (not in main nav) |

Nav order: **CV → Dashboard → Jobs → Intel → Diary**

Truth Score always visible in header (color-coded: red < 40, amber < 70, green ≥ 70).

---

## Component Map

```
components/
├── app-shell.tsx               Nav header + page wrapper
├── truth-mirror-logo.tsx       Logo SVG
├── skill-graph-preview.tsx     Animated SVG skill graph (unlocked vs locked nodes)
├── feedback-widget.tsx         Floating feedback button
├── dashboard/
│   ├── domain-radar.tsx        Recharts radar chart — 10 Lightcast L1 domains (clickable labels)
│   ├── domain-drill-dialog.tsx Modal: skills per domain + level badge + diary log shortcut
│   ├── job-match-card.tsx      Compact job card (used in dashboard job list)
│   └── skill-upgrade-card.tsx  Ranked gap skill card with XP bar
├── tracker/
│   ├── job-tracker-card.tsx    Full job card with status dropdown + apply tracking
│   └── skill-intelligence-panel.tsx  Skill graph preview + skills-to-unlock urgency list
├── market/
│   ├── filter-bar.tsx          Domain/role filter chips
│   ├── drill-down-dialog.tsx   Skill demand drill-down modal
│   └── action-plan-panel.tsx   7-day plan panel
├── onboarding/
│   ├── step-cv.tsx             CV upload step
│   ├── step-role.tsx           Target role selection step
│   ├── step-score.tsx          Score reveal step
│   └── score-gauge.tsx         Animated semicircle gauge (0–100)
├── auth/
│   └── auth-form.tsx           Login + signup form
└── ui/                         shadcn primitives: badge, button, card, dialog, progress, skeleton, tabs
```

---

## State Management

- **Server state:** TanStack Query (`useQuery` / `useMutation`) — all API calls via `lib/api.ts`
- **Auth state:** `lib/hooks/use-auth.ts` — JWT token from Supabase, stored in localStorage
- **UI state:** local `useState` (no Zustand yet — added when needed)

---

## API Layer

All backend calls go through `frontend/lib/api.ts`:

| Export | Endpoints used |
|--------|---------------|
| `scores.me(token)` | `GET /scores/me` |
| `jobs.matches(token)` | `GET /jobs/matches` |
| `jobs.compute(token)` | `POST /jobs/compute` |
| `jobs.applications(token)` | `GET /jobs/applications` |
| `jobs.updateApplication(token, jobId, data)` | `PATCH /jobs/applications/:id` |
| `users.mySkills(token)` | `GET /users/me/skills` |
| `cv.upload(token, file)` | `POST /cv/upload` |
| `cv.me(token)` | `GET /cv/me` |
| `diary.today(token)` | `GET /diary/today` |
| `diary.submit(token, data)` | `POST /diary` |

Backend base URL: `NEXT_PUBLIC_API_URL` env var (defaults to `http://localhost:8000`).

---

## Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:8000    # backend URL
NEXT_PUBLIC_SUPABASE_URL=                   # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=              # Supabase anon key
```

---

## Dev

```bash
npm run dev       # localhost:3000
npm run build     # production build
npx tsc --noEmit  # type check (must be 0 errors before commit)
```

Minimum viewport: **375px** (mobile-first). All layouts use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`).
