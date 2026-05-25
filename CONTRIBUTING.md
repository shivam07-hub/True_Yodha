# Contributing to True_Yodha

Thanks for taking the time to contribute. This repository is the codebase behind a career-intelligence platform that maps what skills companies are hiring for (via job postings + a skills taxonomy) and helps job seekers act on those gaps.

## Ways To Contribute

- Fix bugs in the backend (FastAPI) or frontend (Next.js).
- Improve skill extraction, matching, scoring, or data-quality logic.
- Improve UX/UI (mobile responsiveness matters a lot).
- Improve docs, diagrams, or developer workflow.
- Report issues with clear reproduction steps and screenshots when relevant.

## Development Setup

### Backend (FastAPI)
```bash
cd backend
source ../.venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend config lives in `backend/.env` (do not commit it).

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```

Frontend config lives in `frontend/.env.local` (do not commit it).

## Required Checks (Before Opening a PR)

Run these from the repo root unless noted:

```bash
.venv/bin/pytest backend/tests
```

```bash
cd frontend && npm run lint
```

```bash
cd frontend && npx tsc --noEmit
```

If your change affects user-facing flows, please also do a quick mobile sanity pass at a 375px viewport.

## Branching And PRs

- Do not merge to `main` directly. `main` is production.
- Work from `Develop` (or open a PR targeting `Develop`).
- Keep PRs small and single-purpose.

Suggested workflow:
```bash
git checkout Develop
git pull
git checkout -b feat/short-description
```

## Commit Messages

Use conventional prefixes:
- `feat:`
- `fix:`
- `docs:`
- `refactor:`
- `test:`
- `chore:`

Keep one scope per commit where possible.

## Code Conventions

### Python

- Python 3.11+
- Use type hints throughout.
- Prefer clear domain boundaries (services/schemas/repositories as already structured).
- Avoid "symptom patches" (blanket `try/except`, broad type casts, `or None` hacks). Fix the root cause.

### TypeScript / Frontend

- TypeScript strict mode: no `any`.
- Prefer existing app patterns for API access and state management.
- Web-only, mobile-responsive UI.
- Use Tailwind + shadcn/ui components and the repo’s existing styling conventions.

## Reporting Issues

When opening an issue, include:
- what you expected vs what happened
- steps to reproduce
- screenshots or screen recordings if it’s UI-related
- logs/stack traces if it’s backend-related

## License

By contributing, you agree that your contributions will be licensed under the MIT License (see `LICENSE`).

