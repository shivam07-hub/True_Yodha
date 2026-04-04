"""
Configuration for Job Match backend.
All secrets loaded from environment variables / .env file.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ── Paths ──────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
PROJECT_DIR = BASE_DIR.parent                               # Job_Scrapers/
MASTER_CSV = PROJECT_DIR / "Master_Output" / "ALL_JOBS_NORMALIZED_2026_03.csv"
DB_PATH = BASE_DIR / "jobmatch.db"
OUTPUT_DIR = BASE_DIR / "match_results"                    # CSV output directory

# ── Database ───────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

# ── LLM Provider ─────────────────────────────────────────────────────
# Set LLM_PROVIDER to: "openai" (default) | "anthropic" | "gemini"
LLM_PROVIDER      = os.getenv("LLM_PROVIDER", "openai")
OPENAI_API_KEY    = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GEMINI_API_KEY    = os.getenv("GEMINI_API_KEY", "")

# ── Other API Keys ────────────────────────────────────────────────────
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "jobs@yourdomain.com")

# ── Matching Tuning ───────────────────────────────────────────────────
PREFILTER_TOP_N = int(os.getenv("PREFILTER_TOP_N", "50"))
DEEP_MATCH_BATCH_SIZE = int(os.getenv("DEEP_MATCH_BATCH_SIZE", "10"))
TOP_RESULTS = int(os.getenv("TOP_RESULTS", "5"))

# ── Model (optional override — leave blank to use provider default) ───
# Provider defaults: openai→gpt-4o-mini  anthropic→claude-haiku-4-5  gemini→gemini-1.5-flash
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")   # kept for reference
