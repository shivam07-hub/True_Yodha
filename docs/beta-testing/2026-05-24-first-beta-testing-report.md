# Myro First Beta Testing Report

Date: 2026-05-24
Source: Internshala fellowship outreach, WhatsApp user replies, attached mobile screenshot, Karthikeya Konda's Notion QA report link, Bibi mobile editor feedback, User X onboarding jargon feedback, and User 2's LinkyHost screenshot shared in the product thread.
Audience: Shivam, Claude, Codex, and every future agent improving Myro.

## Celebration

This is Myro's first real beta testing report. The strongest signal is clear: students, freshers, internship applicants, and early job seekers understand the value of one place to save, make, tailor, compare, and manage CV versions.

The first beta did not reject the product. It sharpened it.

Users repeatedly said the idea is practical, modern, useful, and worth returning to if the first-use experience becomes simpler and the phone experience becomes more reliable. That is a strong foundation.

## Product Truth From Beta 1

The simple first-use story is:

> One hub for every CV version. Save your master CV, tailor one for each internship or job, compare readiness, and know which resume to send.

The intelligence layer should be introduced after this story is understood. Myro Score, Intel, Skills, Forge, XP, Tracker, and market demand are powerful, but they should not be the first cognitive load for a beginner.

## What Users Praised

- The CV hub concept is practical for students and freshers managing multiple resumes.
- The interface feels clean, modern, professional, and lightweight.
- Mobile support matters because many students mostly use phones.
- Resume creation, editing, and storage in one place feels convenient.
- Career intelligence, job matching, market demand comparison, and skill gaps feel differentiated.
- XP, streaks, levels, roadmap, and progress tracking feel motivating.
- Users can imagine using Myro regularly if onboarding, labels, and mobile polish improve.
- The concept has strong go-to-market potential through college communities, Instagram reels, LinkedIn, internship groups, and success stories.

## Main Concerns

- First-time users were not sure what to do first.
- Labels like Forge, Intel, Skills, and Ninja Name are not self-explanatory.
- CV management and career intelligence are currently blended in a way that can confuse new users.
- Mobile layout is crowded in places; buttons and tabs can be too small or easy to mistap.
- Some pages and tabs feel slow on mobile data.
- A user could not send feedback properly on phone; the attached screenshot showed the Settings modal squeezed into an unusable desktop layout.
- Users do not understand why they got a low score or how to move from a score like 9 to a better score.
- CV version creation, saving, switching, and comparison need clearer labels.
- Mobile CV editing is too hard when it depends on finger drag-and-drop or small text boxes.
- Users do not see enough draft-safety reassurance; they worry app close or refresh can lose work.
- Mission/onboarding terminology like "Forge Product Family Engineering" and "L0 -> L1" can intimidate first-time job seekers.
- Gamified systems like XP, streaks, locked features, heatmaps, missions, and score systems can motivate, but can also create pressure if they appear before the user understands value.
- Company/job recommendation trust needs clearer explanation so freshers understand why a company, role, or match is shown.
- CV upload and AI processing interruptions make the whole product feel blocked because many features depend on CV-based analysis.
- Feedback collection should appear naturally during onboarding and feature usage, not only as a separate end-of-flow form.
- Password recovery/change-password flows are missing.
- Public trust is underdeveloped: privacy policy visibility, data handling explanation, score methodology, social proof, accessibility, and SEO.
- `noindex, nofollow` on the public site was a critical discovery risk.

## Additional Feedback Logged After Initial Report

### User Bibi - Mobile CV Editing

- Drag-and-drop is not working well on mobile; moving sections with a finger is hard.
- Typing and editing text in small boxes is difficult on a phone screen.
- The user could not find a "Save Draft" button and worried that accidental app close would lose all work.
- Direct recommendation: improve mobile drag-and-drop and add auto-save.

Product interpretation:

- Treat drag-only section movement as a mobile accessibility failure. Add explicit reorder controls or a bottom-sheet reorder mode rather than relying only on touch drag precision.
- Treat draft safety as part of trust. Auto-save needs a visible saved/saving/error state and a recovery path after refresh or app close.
- Mobile text editing should use larger fields, stronger focus states, and preferably full-screen edit affordances for dense CV sections.

### User 2 - LinkyHost Screenshot

Source link: `https://sparkling-grass-437.linkyhost.com/`

- Praised the modern concept, visual polish, CV analysis, skill intelligence, job matching, tracker, bottom navigation, and organized feel.
- Felt confused by corporate-heavy terminology such as stakeholder management, agile project management, product strategy, go-to-market strategy, data/business analysis, and user research/discovery.
- Felt XP, streaks, heatmaps, missions, progression tracking, locked features, and score systems are creative but can feel pressure-like for anxious students if introduced too early.
- Asked for clearer company/job clarity and trust: explain company recommendations and role matching.
- Reported a major CV upload and AI processing issue; the upload did not complete smoothly and made the experience feel interrupted.
- Said screens can feel messy and overwhelming because many tabs, metrics, and tracking elements are visible together.
- Recommended beginner-friendly walkthroughs or accessibility guidance before users enter the platform deeply.
- Recommended embedding small feedback questions during onboarding and feature usage, because separate feedback forms are often skipped.

Product interpretation:

- Introduce career intelligence gradually after the CV hub first-use story.
- Simplify beginner-facing language and add plain-English definitions where terminology is unavoidable.
- Make the first CV upload reliable, resumable, and transparent before pushing deeper intelligence features.
- Reduce early dashboard density and reveal advanced metrics after the user has a working CV and first score.
- Add contextual feedback prompts at moments of friction, such as after upload, first score, first saved job, first edit, and first failed action.

### User X - Onboarding Jargon

- First-time or general job seekers can find Mission page terms intimidating or confusing.
- Specific examples: "Forge Product Family Engineering" and "L0 -> L1".
- Recommendation: add clear onboarding tooltips or brief explainers so the platform is accessible from day one.

Product interpretation:

- Do not assume product-management or game-system vocabulary is beginner-safe.
- Prefer plain labels first, with branded terms second. Example: "Practice session" can carry "Forge" after the user understands the action.
- Tooltips should explain non-visible meaning only; avoid redundant helper text when a visual state already communicates the fact.

## What We Already Shipped From This Report

### Commit `e2c7b00` - CV Hub First-Use Story

- Root `/` now renders the CV hub story directly instead of redirect scaffolding.
- `/about` reuses the same public CV hub composition.
- Public metadata now says "One hub for every CV version".
- Global `noindex, nofollow` was removed.
- Private app routes remain blocked through `robots.txt`.
- Sitemap now includes `/about`, `/intel`, and `/terms`.
- Hero, steps, nav, and sample diagnostic were reframed around: master CV -> tailored versions -> score comparison -> apply.
- Verified at 375px mobile with no horizontal overflow.

### Commit `4ceab03` - Mobile Feedback Reachability

- Fixed the phone feedback blocker from the attached screenshot.
- `SettingsModal` now becomes a full-width mobile sheet.
- Account, Following, Feedback, and Billing are reachable as compact top tabs on phone.
- Account fields are full-width on mobile instead of squeezed into a narrow right rail.
- Settings dialog z-index now sits above the mobile profile sheet.
- Feedback Hub now has a compact full-height phone layout.
- Verified at 375px that Settings and Feedback Hub have `documentElement.scrollWidth === 375` and no horizontal overflow.

## Current Claude/Codex Coordination State

Codex did not have direct Claude runtime coordination, but the shared worktree shows Claude-aligned in-progress work:

- `frontend/app/cv/page.tsx`: auto-open upload picker when arriving at `/cv?upload=1`.
- `frontend/components/auth/auth-form.tsx`: safe `?next=` handling so public CV hub signup can land the user in the CV upload flow.

Codex did not overwrite or commit those files. Future agents should preserve and review them before continuing the CV hub onboarding path.

## Priority Backlog From Beta 1

### P0 - Trust, Access, and First Successful CV

- Make first CV upload and AI processing resumable, retryable, and transparent on weak mobile data.
- Make CV delivery/download durable and resumable for slow networks in India.
- Add CV draft auto-save with visible saved/saving/error state and recovery after app close or refresh.
- Remove any "Wi-Fi recommended" first-upload copy; the product promise is that first success works even on weak mobile data.
- Add forgot-password and change-password flows.
- Make privacy/data-handling clear before CV upload.
- Add score methodology and "Why this score?" explanation.

### P1 - First-Use Clarity

- Add a short guided onboarding around the CV hub story.
- Fix onboarding step mismatch: four dots but "Step 2 of 3".
- Rename or explain jargon: Forge, Intel, Skills, Ninja Name.
- Rename or explain Mission terminology: Forge Product Family Engineering, L0 -> L1, missions, XP, streaks, heatmaps, and locked features.
- Split mental model: "CV Hub" first, "Career Intelligence" second.
- Add low-score improvement guidance like "How to reach 20/50".
- Add beginner-friendly walkthroughs that introduce advanced tabs and metrics only after the first CV moment.
- Consider Hindi/simple-language support for tier-2 students.

### P1 - Mobile Usability

- Audit all major mobile tabs at 375px.
- Enlarge small tap targets.
- Reorder cards/tabs so the fastest and most important content appears first.
- Reduce crowded mobile spacing on Skills, Intel, CV preview, and Settings.
- Make "Pick a target job" highly visible on mobile.
- Fix mobile CV editor drag-and-drop with explicit touch-safe reorder controls.
- Increase mobile CV text-editing comfort with larger fields or full-screen edit mode.
- Add visible auto-save/draft recovery states for CV editing.

### P1 - CV Version Management

- Add clear CV version labels: date, target role, tags.
- Make saved versions easy to find and switch.
- Add side-by-side preview/compare.
- Add application tracking: "This CV was sent to Company A on 24 May".
- Add templates for internships, freshers, and industries.
- Improve document format recognition and upload format suggestions.

### P2 - Growth Loop

- Keep Instagram reels, before/after resume transformations, college WhatsApp groups, LinkedIn, internship communities, and success stories as GTM channels.
- Position: "One Hub, All Your CVs - Apply Faster" or "One CV for every job" as testable messaging.
- Build shareable improvement loops around score -> explain -> improve -> share.
- Add in-context feedback prompts during onboarding and key feature moments instead of depending only on separate feedback forms.

## System Principle Going Forward

Every user should make the platform better for every future user.

That means feedback should become an internal product loop:

1. Capture feedback in-app with route, viewport, user context, and optional screenshot.
2. Classify by product area: CV Hub, Onboarding, Mobile, Score, Trust, Auth, Performance, Growth.
3. Convert repeat patterns into roadmap issues.
4. Ship fixes in small commits.
5. Show users "shipped from feedback" so they learn that speaking up changes the product.

## Agent Handoff

For Claude and Codex:

- Preserve the praise. Do not make Myro heavier while fixing confusion.
- Treat CV Hub as the front door.
- Treat mobile as first-class, not a responsive afterthought.
- Treat trust as product, not legal footer decoration.
- Prefer durable architecture over quick UI patches, especially for CV upload/download.
- Before marking any beta item done, verify at 375px mobile and run the repo checks required by `AGENTS.md`.

## Closing Note

Beta 1 is finished. The result is worth celebrating: users saw the value. The work now is to remove friction until the first useful CV moment happens quickly, clearly, and reliably for the next student who opens Myro on a phone.
