# Phase 1A — Repository & Infrastructure

> Complete every item here before moving to Phase 1B (Database).
> Reference: `docs/DEPLOYMENT_GUIDE.md` for step-by-step Git/GitHub/Vercel commands.

---

## Checklist

### Local Setup
- [x] `.venv/` created at project root (`python3 -m venv .venv`) ← DONE
- [ ] `backend/requirements.txt` written with core deps
- [ ] `.gitignore` created at project root

### Repo Scaffold
- [ ] Monorepo folder structure created (see structure below)
- [ ] `backend/.env.example` created
- [ ] `frontend/.env.local.example` created
- [ ] `README.md` written (setup + deployment instructions)
- [ ] `skill_taxonomy_mapping/TAXONOMY_CHANGELOG.md` created

### GitHub
- [ ] GitHub repo created (`mirror-app`, private)
- [ ] Local repo initialised (`git init`) and connected to GitHub remote
- [ ] Initial commit pushed to `main`
- [ ] `develop` branch created and pushed
- [ ] Branch protection on `main` configured (PR required, CI must pass)

### CI/CD
- [ ] `.github/workflows/backend-ci.yml` created (lint + pytest on PR to develop)
- [ ] `.github/workflows/frontend-ci.yml` created (eslint + next build on PR to develop)

### Cloud Accounts
- [ ] Supabase project created, credentials saved to `.env` (NOT committed)
- [ ] Railway account set up, backend project created
- [ ] Vercel project linked to GitHub `main` branch

---

## Folder Structure to Scaffold

```
mirror-app/
├── .venv/                              ← Python virtual env (gitignored)
├── CLAUDE.md
├── README.md
├── .gitignore
├── .github/
│   └── workflows/
│       ├── backend-ci.yml
│       └── frontend-ci.yml
├── skill_taxonomy_mapping/
│   ├── taxonomy.json
│   ├── Skill_Taxonomy_v1.xlsx
│   └── TAXONOMY_CHANGELOG.md
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py          ← Supabase client factory (not SQLAlchemy)
│   │   ├── models/              ← reserved for future use
│   │   ├── schemas/             ← Pydantic request/response models
│   │   ├── routers/
│   │   └── services/            ← business logic + import pipeline scripts
│   ├── tests/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── package.json
│   ├── next.config.js
│   └── .env.local.example
├── database/
│   ├── schema.sql
│   └── seed_skills.sql
└── docs/
    ├── phases/
    └── [reference docs]
```

---

## .gitignore Content

```
# Python
__pycache__/
*.pyc
.venv/
venv/
*.egg-info/

# Node
node_modules/
.next/
out/

# Environment (NEVER COMMIT)
.env
.env.local
.env.production
.env.development
*.env

# IDE
.idea/
.vscode/

# OS
.DS_Store

# DB
*.db
*.sqlite3

# Logs
*.log
logs/
```

---

## CI/CD Workflow Files

**`.github/workflows/backend-ci.yml`:**
```yaml
name: Backend CI
on:
  pull_request:
    paths: ['backend/**']
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: cd backend && pip install -r requirements.txt && pytest tests/ -v
```

**`.github/workflows/frontend-ci.yml`:**
```yaml
name: Frontend CI
on:
  pull_request:
    paths: ['frontend/**']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', cache-dependency-path: frontend/package-lock.json }
      - run: cd frontend && npm ci && npm run lint && npm run build
```

---

## Environment Variables (keys only — no values)

**`backend/.env.example`:**
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
GROQ_API_KEY=
OPENAI_API_KEY=
SENDGRID_API_KEY=
RAILWAY_ENVIRONMENT=
```

**`frontend/.env.local.example`:**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_BASE_URL=
```
