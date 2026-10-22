# Launch videos — how Myro films itself

`/myro-brag` (local skill) runs the upstream `/brag-slim` from `repos/brag/`
(pinned in [repos/README.md](repos/README.md)) under the rules below. Where the
two disagree, this file wins. Output is files only; posting is Shivam's.
When each video goes out: [MARKETING_SCHEDULE.md](MARKETING_SCHEDULE.md).

## What to film — the loop, nearest the north star first

1. **The loop in one take.** CV in → the job that fits → CV tailored to it →
   downloaded → Apply on the company's own page. Real components:
   `frontend/components/market/job-card.tsx` (Tailor CV), `frontend/components/cv/builder/`
   (`pdf-page`, `cv-export-view.tsx`, `apply-modal.tsx`),
   `frontend/components/cv/download-cv-button.tsx`.
2. **The extension.** Save a job from any page → tailored CV. `Chrome_extension/`.
3. **Myrology.** The second product line, judged on its own — `frontend/app/myrology/`.

The Myro Score and the gap read are what the machine knows about you, not the
product. They can appear in a shot; they are never the headline.

## Data — fiction only

- **Dev and prod share one database.** Any signed-in screen, local or not, shows
  real people. Never film a signed-in session, the phone lab's live mode, or
  `/cv-preview` with a file (it calls the scoring backend).
- Render the real components with made-up props: one fictional person, one
  fictional CV. The landing samples in `frontend/components/public/landing/*-sample.tsx`
  are already illustrative and labelled — reuse them.
- Never read for a video: `User job matches and CVs/`, `Output per users/`,
  `reference/`, `User_Feedbacks/`, `tmp/`, `logs/`, `mcp-servers/`, any `.env*`.
- Partner names and logos (Finlatics) only with the partner's OK.

## Claims — true today or absent

- Numbers only from `backend/scripts/loop_reach.py`, own accounts excluded
  (`backend/app/services/test_accounts.py`), with the date they were read. Today's numbers
  are small — show the product, not a count.
- No testimonials, user quotes, "trusted by", or employer logos that read as a
  partnership.
- Myro does not apply for you. You apply on the company's page with the CV Myro
  made. Never show or say auto-apply.
- No prices until checkout is live (#56 is spec only).
- Film only what a user can do today. An extension feature counts once the
  Chrome Web Store listing carries the version that has it — on `main` is not
  enough (form fill was on `main` in 0.2.5 while the store read 0.2.3; its
  video waited for the store).

## Voice and look

- Share copy: `brand-guidelines`, then `write-like-human`. On-screen words come
  from the product's own copy.
- Colours from `frontend/app/design-tokens.css`; mark
  `frontend/public/brand/myro-mark.png`; fonts as `frontend/app/layout.tsx`
  loads them. [ANTI_SLOP.md](ANTI_SLOP.md) applies to every frame.
- Vertical 1080×1920 first (LinkedIn, Instagram); landscape for X.

## Output

- Renders go to `brag-output*/` (gitignored). A render is never committed.
- Needs Node, a headless Chromium (Playwright's cached build) and an H.264/AAC
  encoder. This Mac has no ffmpeg and no Homebrew: encode with AVFoundation
  through `swiftc` (Command Line Tools), which needs no download.
- Real components render outside Next by bundling them with esbuild from
  `frontend/` (stub `next/link`, `next/navigation`, `next/image`) and building
  Tailwind from `frontend/tailwind.config.ts`. Abort every non-file request
  while capturing.
