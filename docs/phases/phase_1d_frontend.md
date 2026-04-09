# Phase 1D — Frontend (Next.js)

> Start here only after Phase 1C is fully checked off.
> Web only. All pages must render correctly at 375px viewport width.

---

## Checklist

### Setup
- [x] Next.js 14 (App Router) initialised in `frontend/` — TypeScript + Tailwind
- [x] Supabase client configured in `lib/supabase.ts`
- [x] Typed API client in `lib/api.ts`
- [x] shadcn/ui installed

### Pages
- [x] Landing page (`/`) — CV upload + LinkedIn sign-in + "Get My Score" CTA
- [x] Auth: `/login` and `/signup`
- [x] Onboarding Step 1: CV upload (drag-and-drop, PDF/DOCX, max 10MB)
- [x] Onboarding Step 2: Target role dropdown + location
- [x] Onboarding Step 3: Score reveal (animated gauge + domain radar + top 3 job cards)
- [x] Dashboard: Mirror Score + domain radar + Top 5 upgrade cards + Top 10 job matches

### Quality Gates
- [x] All pages mobile-responsive (test at 375px and 390px)
- [x] No `any` in TypeScript
- [x] All server state through TanStack Query
- [x] Frontend deployed to Vercel via GitHub `main` branch

---

## User Journey

```
/ (Landing)
  ↓ Upload CV or LinkedIn sign-in
/onboarding
  Step 1 → CV upload (async parsing, progress state)
  Step 2 → Target role + location
  Step 3 → Score reveal (animated)
  ↓
/dashboard
  Mirror Score gauge
  Domain radar chart (10 domains)
  Top 5 skill upgrade cards
  Top 10 job matches (LLM-ranked, with explanations)
```

---

## Free Use Cases — STOP AND ASK USER

When you reach free use cases (F1–F10), **stop and ask**:
> "Which of these 10 free use cases should we prioritise first for the UI?"

F1: Resume Snapshot Scan | F2: ATS Check | F3: Skills Inventory | F4: Job Title Match Score
F5: Single Job Gap | F6: Top 3 Missing Skills | F7: LinkedIn Audit | F8: Salary Estimate
F9: Mirror Score | F10: Priority Action

Do not implement any until user confirms priority.
