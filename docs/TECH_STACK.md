# Tech Stack & Architecture Decisions

> These decisions are final for Phase 1. Do not change without updating this file.

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| Frontend | Next.js | 14 (App Router) | Vercel-native, SSR, TypeScript |
| Frontend styling | Tailwind CSS | 3.x | Rapid mobile-responsive UI |
| Frontend state | Zustand | 4.x | Lightweight client state |
| Frontend data | TanStack Query | 5.x | Server state, caching |
| Backend | FastAPI | 0.110+ | Async Python, aligns with scraper codebase |
| Database | PostgreSQL via Supabase | 15 | Free tier, auth built-in |
| ORM | SQLAlchemy | 2.x | Async, migration support |
| Migrations | Alembic | 1.x | Paired with SQLAlchemy |
| Auth | Supabase Auth | — | JWT, LinkedIn OAuth, RLS |
| CV Parsing | PyMuPDF + python-docx | — | Extract text from PDF/DOCX |
| Skill Tagging | spaCy + keyword map | — | Maps extracted skills to taxonomy |
| Job Matching | Skill-overlap + GPT-4o mini | — | Fast overlap first, LLM re-rank |
| LLM | OpenAI GPT-4o mini | — | Cost-efficient for Phase 1 |
| Job Scraping | Existing Python engine | — | Already built |
| Frontend hosting | Vercel | — | Free tier, auto-deploy from main |
| Backend hosting | Railway | — | Free $5/month credit, Docker |
| DB hosting | Supabase | — | Free tier: 500MB |
| Email | SendGrid | — | Free 100/day |
| Analytics | Posthog | — | Open source, free tier |
