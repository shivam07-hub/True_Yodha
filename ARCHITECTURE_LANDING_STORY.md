# Landing story: one scroll from "what MNCs hire for" to your gap

**Architecture spec #66. Written 2026-11-26 by Claude from a grill with Shivam,
the live `/public/stats`, and a code walk.** Shivam's ask: the landing "looks
very AI generated" and "does not give us the flow state". What Myro is, in his
words: "we match which is the best job for your CV along the job in the MNC.
And secondly, what are the skills that are missing in your CV and how you can
fulfill them… this is the bridge… I want this to come out."

> **VERIFY IN CODE before building.** Line numbers are from `aec9dfb3`. One slice
> = one commit on `Develop`, six gates green, `git add` only your own files.
> `/read-path-perf` before L1 and L5. No migration in this spec.

---

## 1 · What is true today

**The page** ([landing-page.tsx:68](frontend/components/public/landing-page.tsx)):
top nav → `LandingHero` → `LandingUseCases` (4 tabs) → `LandingFinlaticsRail` →
`LandingCompanyRail` → `LandingLiveMirror` (the LLM log) → `LandingJobSearch` →
`LandingCommons` (open source) → `PublicFooter`.

- H1: "Run your Job hunt like an Operation." (`landing/hero.tsx:68`), counters
  above a drop zone, two path cards ("First job", "Switching").
- It describes the machine (counters, tok/s, tabs, an MIT tile), not the person
  crossing from their CV to the job. Nothing changes as you scroll, and it asks
  for a CV at second 3.
- Footer carries a GitHub icon (`public-footer.tsx:28`) and a LICENSE link
  (`:116`).

**Live numbers, `GET /public/stats`, 2026-11-26:** 114,356 jobs tracked · 286
company career pages · 15,943 jobs verified live in the last 7 days · 327 role
families. Top domains: Sales & Marketing 24,269 · IT & Infrastructure 11,710 ·
Software Engineering 11,262 · Finance 9,142.

**What the code already gives this page:**

| Need | Exists | Where |
|---|---|---|
| Six experience bands | intern 0–1, entry 0–2, mid 2–5, senior 5–8, lead 8–12, executive 12–40 | `job_eligibility.py:220` |
| Anonymous one-job fit | `POST /public/jobs/{job_id}/fit-preview` | `routers/public.py:441` |
| Anonymous CV score + rewrite cards | `/cv-preview` playground, login only to save | `components/public/cv-preview/` |
| Skill demand guards | ≥3 employers, no one employer over 70% | `routers/jobs/skill_demand.py:52` |
| Role families | principal only, so the landing cannot call it | `routers/roles.py:90` |
| Onboarding saves the family | ranked by CV overlap, saves the family | `onboarding/target-confirm.tsx:242`, `:366` |
| Human Check slots | 5 open at once, 24 h, ETA before paying | `human_check.py:35`, `availability` `:151` |
| Gap kinds | latent (rewrite), absent (build), shallow | `gap_planner.py` |

---

## 2 · The story in one line

> See what MNCs hire for → see the jobs open now → see the skills they want →
> see your CV against the job → fill the gap → a named person reads it → upload.

Each chapter answers the last one's question and stands on its own: no chapter
says "from chapter 2".

---

## 3 · Decisions (grill, 2026-11-26)

| # | Decision |
|---|---|
| Q1 | Aspiration first: the job they want decides; the CV breaks ties. |
| Q2 | The headline gap is per role and level, not per single job. |
| Q3 | Apply leads; learning runs alongside, never blocks applying. `career_skill_path_cards.next_action` (`:53`) needs an apply step. |
| Q4 | Practise → prove → add to CV. Finlatics sits inside that loop. |
| Q5 | Early career is the story's face; all six bands are served. |
| Q6 | Tap a role, then a level (the six bands). The pick becomes the same Direction onboarding saves. |
| Q7 | Show what MNCs ask for that role and level before upload. Needs a new public, snapshot-backed read. |
| Q8 | First screen after upload: the role + level gap (matched / rewrite / missing) and "N jobs within reach today", reusing fit-preview and the playground rewrite cards. |
| Q9 | Sign-up only at tailor or save. |
| Q10 | Keep the Finlatics rail. The LLM log and job search move to `/intel`. Counters and the company rail move into chapter 2. |
| Q11 | Hero names its subject: "See what MNCs hire for. Find your CV's gap before they do." No orphan "they". |
| Q12 | The scroll device is a bridge that fills, never a score. The first number a visitor sees is their own. |
| Q13 | Role chips are the top 8 families by live demand, same guards as skill demand, plus search and "Not sure? Upload". |
| Q14 | A reviewer chapter: Shivam's face and credentials sell trust and the ₹199 Human Check. Its button is the same upload. |
| Q15 | Shivam reviews every paid check, 5 at a time. The page shows the live slot count. |
| Q16 | Queue with ETA stays (ENG2/ENG3 unchanged): a check sells in every state. The page says "full" only when all 5 slots hold a check. |
| Copy | Open jobs come before skills; both show 4 roles, not one. Footer: no GitHub, no open source; Myro LinkedIn, Instagram, X; Shivam's LinkedIn only. |

---

## 4 · The page, chapter by chapter

Copy is final unless marked *placeholder*; numbers marked *live* render from the
read in L1 or `/public/stats`, never hardcoded.

**Pinned the whole way:** `Your CV ●━━━━━○ The job you want`. One step fills per
chapter. At 375px it becomes a thin bar under the nav. After upload the line
becomes their real score for the role and level.

### 1 · Hero

> # See what MNCs hire for.
> # Find your CV's gap **before they do.**

- "before they do" lands in full text after a muted "Find your CV's gap": emphasis
  by contrast. Azure was the grill's pick, but the design system keeps the
  interactive colour for things you can press (frontend-design §2, §4); Shivam
  can overrule.
- `[8 role chips, live]` `[search]` · "Not sure? Upload" (the CV ranks the
  families, as onboarding already does).
- After a role tap: `Internship · 0–2 · 2–5 · 5–8 · 8–12 · 12+`. A level whose
  live count fails the demand guards is greyed, no text.
- Title tag keeps MNC + India.

### 2 · Open jobs

> ## Open right now at top companies
> Business Analyst ████████ 1,240 · Deloitte, KPMG, HSBC
> Software Engineer ██████ 980 · Infosys, Accenture, Amazon
> Sales Manager █████ 870 · …
> Financial Analyst ████ 640 · …
> From 286 company career pages · 15,943 jobs checked live this week
> `[company logo rail]`

- Top 4 families *live* (roles, counts and companies above are *placeholders*).
  A family tapped in the hero that is not in the top 4 shows first.
- Each row links to its jobs on `/intel`.
- "checked live this week" = `/public/stats` `verified_live`. Never "every day":
  the scraper does not run daily.

### 3 · Skills

> ## Skills top companies hire for
> `Business Analyst | Software Engineer | Sales Manager | Financial Analyst`
> SQL ███████ 71% · Excel █████ 54% · Stakeholder mgmt ████ 41% …
> 0–2 years · from 412 live jobs at 38 companies

- Same 4 roles as tabs (swipe at 375). Percent = share of that role's live jobs
  at that level asking for the skill. All figures *live*; above are
  *placeholders*.

### 4 · The gap

> ## Your CV, read against the job
> Example · Data Analyst, 0–2 yrs
> **Matched:** Excel, SQL
> **Rewrite:** "Handled reports for sales team" → "Built weekly SQL sales reports for 12 regional managers"
> **Missing:** Power BI
> `[Upload CV]`

- Self-contained, labelled Example. The before → after line shows the rewrite;
  no sentence explains it. Maps to latent / absent in `gap_planner.py`.

### 5 · Fill the gap

> ## Add what's missing. Prepare for what they'll ask.
> Learn → Prove → Add to CV → Interview prep
> `[Finlatics rail: programmes for the missing skills]`

- The four steps are the prep ladder in user words
  ([UNIFIED_PREP_V2.md](UNIFIED_PREP_V2.md)).

### 6 · Meet your reviewer

Pattern from finlatics.com "Meet Our Mentors": plain heading, one line, a card
with photo, name with LinkedIn icon, a short third-person bio.

> ## Meet your reviewer
> Every paid review is read by one person.
>
> `[photo]` **Shivam Pathak** `in`
> Shivam has rewritten nearly 5,000 CVs and works in Data & AI at a global tech
> consulting firm, after Accenture and JLL.
> MBA, IIM Lucknow · B.Tech, MIT Manipal · CAT 99.65 · XAT 98.05
>
> ●●●○○ 2 open now · CV check · LinkedIn rewrite · back in 24 hours · ₹199
> `[Apply with your CV]`

- Dots = live open checks. All five taken: `●●●●● All 5 taken · yours back by
  Fri 4 pm` from `availability().ready_by`. Payment is taken in both states.
- "Apply with your CV" is the same upload; the slot is offered after the score
  (ENG3's door).
- Photo: `Finlatics/01 Mentor Profile/Mr. Shivam Pathak - photo.png` (1254²,
  dark ground). That folder is gitignored: copy to `frontend/public/`, ~400px.
- LinkedIn: `https://www.linkedin.com/in/spyog/`.

### 7 · Close

> ## See your gap. Free, no sign-up.
> `[drop zone]`

### Footer

- Remove: GitHub icon (`public-footer.tsx:28`), `GITHUB_URL` (`:38`), the
  LICENSE / open-source link (`:116`).
- Myro: LinkedIn, Instagram, X. Shivam Pathak: LinkedIn only.
- Pricing link for those who look.

---

## 5 · Honesty rules for this page

- **No number without a read.** Every count is live; a failed read hides the
  line, never shows a floor dressed as a fact.
- **No fake scarcity.** "Full" only when all 5 slots hold a check. Showing it otherwise
  is "false urgency" under India's CCPA dark-patterns guidelines (2023), and
  OFFERING.md calls overpromising copy a bug.
- **Credentials are the agreed list, nothing more.** No Capgemini name (Shivam,
  2026-11-26). "Nearly 5,000" because Shivam said "around". XAT 98.05 comes from
  his MBA CV (`453_Shivam Pathak_C_27th.docx`); LinkedIn was behind its login wall,
  so the figure was not checked there.
- **No user count.** `/public/stats` returns `seekers`; the page never shows it
  (the unused `NEXT_PUBLIC_SEEKERS_COUNT` read left with L6).
- **Before upload: "open now", never "within reach".** Reach needs a CV; it
  belongs to the first screen after upload (Q8). Within reach = a live listing at the picked
  level naming 2+ skills the CV holds; the page says so under the number.

---

## 6 · Slices

| # | Slice | Done when |
|---|---|---|
| L0 | Footer: drop GitHub + LICENSE link, add Shivam's LinkedIn | Footer on every public page shows the new set; `check:reach` green |
| L1 | `GET /public/landing-roles`: top 8 families by live jobs (skill-demand guards); per family, open count by band, top 3 companies, top skills with share by band. Built into the same cached compile as `_compile_public_stats` (`public.py:105`) | `/read-path-perf` measured; one cached response, no per-visitor DB work |
| L2 | Hero: two-line H1, chips from L1, level row, "Not sure? Upload"; the pick rides the upload as `/cv-preview?role=…&level=…` | 375px works; chip + level carried into upload. **Built 2026-11-26.** Moved out: role search (L2b) and the bridge rail (L3, it needs chapters to fill) |
| L2b | Role search for a family outside the top 8: the snapshot carries every qualifying family's name and count, the search filters them client-side | A searched role carries into upload like a chip |
| L3 | Chapters 2–3 from L1, plus the bridge rail | Counts match L1; tabs swipe at 375. **Built 2026-11-26.** The counters strip left the hero; the company rail closes chapter 2; the pick lives on the landing page so chapters 2–3 follow it. Skills under 5% of a slice dropped in the compile. **Fixed 11-26:** the compile counted every `jobs` row, closed ads included, as open (Business Analysis 4,807 rows, 2,301 live); it reads live listings only (`listing_liveness.is_live`), and `landing_roles_version` makes the refresh guard rebuild an older payload without waiting for a scrape. The rail sticks under the nav: `.tm-landing` and, on phones, `html/body` used `overflow-x: hidden`, which made them scroll containers and un-stuck the nav too; the landing now uses `clip` (scoped by `:has(.tm-landing)` on phones) |
| L4 | Chapters 4–5: the example and the ladder; Finlatics rail moves here | **Built 2026-11-26.** Chapter 4's Upload CV opens the file picker where the reader is and hands off through the dropzone's own `useCvHandoff`, so it lands on the same `/cv-preview?role=&level=`; `uploadDestination` moved to `role-picker.tsx` for every upload to share. Chapter 5 closes with the Finlatics rail, the whole catalogue: "programmes for the missing skills" needs a family → programme match in the snapshot (the signed-in `/career-skill-path` training match exists). Section titles wrap, balanced, instead of being clipped (chapter 5's ran off a 375px screen); chapter sub-lines read at caption size, not 9px |
| L5 | Reviewer chapter + a public open-check count read (`human_check.availability`), photo asset | Dots match `/admin/checks`. **Built 2026-11-26.** `GET /public/human-check` (READ_PATH §36): `capacity`, `slots_open`, `check_hours`, `ready_by`, `price_paise`, so the 5, the 24 and the ₹199 come from code. `slots_open` counts open checks, so a late check still holds its slot. On 11-26 the table holds no check, so the page reads "○○○○○ 5 open now". The bio names Shivam without a pronoun ("…nearly 5,000 CVs and works in Data & AI…"). Photo at `frontend/public/reviewer/shivam-pathak.jpg`, 400px, 32 KB. The terms describe the ₹199 pack as OFFERING.md sells it today; the 11-26 call-inclusive ₹199 changes this line when it is built |
| L6 | Close; delete `LandingUseCases`, `LandingCommons`, `LandingJobSearch`, `LandingLiveMirror` from the landing (log + search live on `/intel`) | No unreachable component left behind. **Built 2026-11-26.** Chapter 7 is the hero's dropzone again, carrying the pick ("Your CV vs …" when one is set); it is the last bridge step. Search and the industry explorer were already on `/intel`; colleges and the newsletter stay in the footer and nav. The log was not on `/intel`: the live-mirror was the LLM-runner console's last mount, and its GPU % and tokens/s were `Math.random()`, so it left with its CSS and seed model instead of moving. Gone with the four sections: the five tab samples, six stylesheets, the unused counts in `useLandingData` |
| L7 | After upload (Q8): role + level gap and "N within reach today" | Reuses fit-preview and playground cards; sign-up only at tailor or save. **Built 2026-11-26.** `/public/score-cv` takes `role` + `level` (the landing's roles and the six bands only) and returns `target`: matched and missing among the skills chapter 3 showed for that level (the role's when the level is thin or unpicked), and live listings at that level, and of those the ones naming 2+ skills the CV holds (READ_PATH §37). The first screen after such an upload is the gap (`RoleGap`): "N jobs within reach today", "of M open · each names 2+ of your skills", then chapter 4's rows from this CV (Rewrite quotes the first line the playground flags). "See N jobs" opens sign-up; "Fix my CV" opens the playground, whose rewrites aim at the picked role, and its back button returns to the gap with edits kept. Not fit-preview: that reads one job, and a role needs every live one. **Within reach, defined:** two shared skill names, not half a listing's skills: over 40 real accounts a CV held 2–4% of a listing's named skills on average, so a half rule reads 0 for nearly everyone. Found on the way: the logged-out playground had sent every visitor to /login since 09-29 (fixed, `3e423a7f`) |
| L8 | `next_action` gains an apply step (Q3) | Apply shows before learning on the skill path |

L0 collides with nothing. L1 blocks L2, L3. L5 needs only L0's footer set.

**L3 data risk (measured 11-26):** skill tags carry tagger mistakes that pass every
guard, e.g. "Track (Rail Transport)" under Project Management and "International
(SEO Software)" under Business Consulting. Chapter 3 shows them as written unless
#60 (skill evidence) or a deny-list row lands first.

---

## 7 · Open

- Shivam: should the GitHub repo itself go private? Removing the footer link
  does not hide it. Since L6 no public page claims open source (the last one,
  `IntelHero`'s lede, left with the runner console).
- Shivam: X stays in the footer unless he says otherwise.
- The real top 4 roles may differ from the placeholders; the copy holds for any
  four. **Measured 2026-11-26 (L1 dry run):** Banking Services 11,695 ·
  Software Development 5,885 · Business Analysis 4,807 · AI/ML 4,430 ·
  Project Management 2,627 · Business Strategy 2,448 · Business Consulting 1,748 ·
  Customer Service 1,644. Chips show family names; "Artificial Intelligence and
  Machine Learning (AI/ML)" needs a short display name in L2.
- **App-wide, fixed 2026-11-26:** `globals.css` set `html, body { overflow-x:
  hidden !important }` under 768px, which un-stuck the public nav on every
  body-scrolled public page at 375px. It is now `clip` (with `hidden` as the
  fallback line) for the whole app, and the landing's `:has(.tm-landing)`
  override is gone. `/signup/institutions` lost its own `.es-page { overflow-x:
  hidden }` the same day (nothing there overflows), so its nav sticks too; its
  form card stays unstuck, as it is taller than a 1366×768 laptop allows.
- Intern bands are thin in most families (0.3% of active jobs state intern).
  The hero's "Internship" level will often be greyed. Decide in L2 whether the
  level row links greyed Internship to `/internships` instead.
