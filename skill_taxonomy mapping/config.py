"""
config.py — Central configuration for the skill taxonomy pipeline.
"""
import os
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR      = Path(__file__).parent
CSV_BASE      = BASE_DIR.parent / "All_CSV_Outputs"
DB_PATH       = BASE_DIR / "review_db.sqlite"
TAXONOMY_PATH = BASE_DIR / "taxonomy.json"

# ── LLM Provider ───────────────────────────────────────────────────────────────
# Set LLM_PROVIDER to: "anthropic" (default) | "openai" | "gemini"
# Set the matching API key env var before running extract_skills.py
#
#   export LLM_PROVIDER=anthropic  &&  export ANTHROPIC_API_KEY=sk-ant-...
#   export LLM_PROVIDER=openai     &&  export OPENAI_API_KEY=sk-...
#   export LLM_PROVIDER=gemini     &&  export GEMINI_API_KEY=AIza...
#
LLM_PROVIDER      = os.getenv("LLM_PROVIDER", "anthropic")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY    = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY    = os.getenv("GEMINI_API_KEY", "")

# ── IT Industry filter ─────────────────────────────────────────────────────────
# These values match the 'industry' column in the company CSVs.
# Only jobs whose industry contains one of these strings (case-insensitive)
# will be imported into the taxonomy DB.
IT_INDUSTRY_KEYWORDS = [
    "technology",
    "it services",
    "consulting",
    "financial technology",
    "banking",
    "fintech",
    "saas",
    "software",
    "semiconductor",
    "electronics",
    "payments",
]

# ── Minimum JD length to attempt Claude extraction ─────────────────────────────
MIN_JD_LENGTH = 250  # characters

# ── Model override (optional) ──────────────────────────────────────────────────
# Leave LLM_MODEL empty to use the provider's default:
#   anthropic → claude-haiku-4-5-20251001  (~$0.001/job)
#   openai    → gpt-4o-mini               (~$0.002/job)
#   gemini    → gemini-1.5-flash          (~$0.001/job)
ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"   # kept for reference

# ── Skill taxonomy categories ──────────────────────────────────────────────────
# These are the pre-defined categories shown in the Streamlit review tool.
# Skills get assigned to these categories during review.
TAXONOMY_CATEGORIES = [
    "Programming Languages",
    "Cloud Platforms",
    "Data & Analytics",
    "AI & Machine Learning",
    "DevOps & Infrastructure",
    "Databases",
    "APIs & Integration",
    "Frontend & Mobile",
    "Backend Frameworks",
    "Security & Compliance",
    "Project & Process",
    "Enterprise Platforms",
    "Networking & Systems",
    "Soft Skills",
    "Other / Uncategorized",
]

# ── Initial skill→category seed mappings ───────────────────────────────────────
# Helps pre-fill the category dropdown during review.
# Add more here as you discover new skills.
SKILL_CATEGORY_HINTS = {
    # Programming Languages
    "python": "Programming Languages",
    "java": "Programming Languages",
    "javascript": "Programming Languages",
    "typescript": "Programming Languages",
    "go": "Programming Languages",
    "r": "Programming Languages",
    "scala": "Programming Languages",
    "kotlin": "Programming Languages",
    "swift": "Programming Languages",
    "c++": "Programming Languages",
    "c#": "Programming Languages",
    "ruby": "Programming Languages",
    "php": "Programming Languages",
    "bash": "Programming Languages",
    "shell": "Programming Languages",
    # Cloud
    "aws": "Cloud Platforms",
    "azure": "Cloud Platforms",
    "gcp": "Cloud Platforms",
    "google cloud": "Cloud Platforms",
    "cloud": "Cloud Platforms",
    # Data & Analytics
    "sql": "Data & Analytics",
    "excel": "Data & Analytics",
    "power bi": "Data & Analytics",
    "tableau": "Data & Analytics",
    "spark": "Data & Analytics",
    "hadoop": "Data & Analytics",
    "snowflake": "Data & Analytics",
    "data warehouse": "Data & Analytics",
    "etl": "Data & Analytics",
    "dbt": "Data & Analytics",
    # AI & ML
    "machine learning": "AI & Machine Learning",
    "deep learning": "AI & Machine Learning",
    "nlp": "AI & Machine Learning",
    "tensorflow": "AI & Machine Learning",
    "pytorch": "AI & Machine Learning",
    "generative ai": "AI & Machine Learning",
    "llm": "AI & Machine Learning",
    "computer vision": "AI & Machine Learning",
    "scikit-learn": "AI & Machine Learning",
    # DevOps
    "ci/cd": "DevOps & Infrastructure",
    "devops": "DevOps & Infrastructure",
    "docker": "DevOps & Infrastructure",
    "kubernetes": "DevOps & Infrastructure",
    "terraform": "DevOps & Infrastructure",
    "ansible": "DevOps & Infrastructure",
    "jenkins": "DevOps & Infrastructure",
    "git": "DevOps & Infrastructure",
    "helm": "DevOps & Infrastructure",
    "prometheus": "DevOps & Infrastructure",
    "grafana": "DevOps & Infrastructure",
    # Databases
    "oracle": "Databases",
    "postgresql": "Databases",
    "mysql": "Databases",
    "mongodb": "Databases",
    "redis": "Databases",
    "cassandra": "Databases",
    "elasticsearch": "Databases",
    "dynamodb": "Databases",
    # APIs & Integration
    "api": "APIs & Integration",
    "rest": "APIs & Integration",
    "graphql": "APIs & Integration",
    "microservices": "APIs & Integration",
    "kafka": "APIs & Integration",
    "rabbitmq": "APIs & Integration",
    "grpc": "APIs & Integration",
    # Frontend & Mobile
    "react": "Frontend & Mobile",
    "angular": "Frontend & Mobile",
    "vue": "Frontend & Mobile",
    "html": "Frontend & Mobile",
    "css": "Frontend & Mobile",
    "android": "Frontend & Mobile",
    "ios": "Frontend & Mobile",
    "flutter": "Frontend & Mobile",
    # Backend Frameworks
    "spring": "Backend Frameworks",
    "django": "Backend Frameworks",
    "fastapi": "Backend Frameworks",
    "flask": "Backend Frameworks",
    "node.js": "Backend Frameworks",
    # Security
    "cybersecurity": "Security & Compliance",
    "iam": "Security & Compliance",
    "sso": "Security & Compliance",
    "oauth": "Security & Compliance",
    "gdpr": "Security & Compliance",
    "iso 27001": "Security & Compliance",
    # Project & Process
    "agile": "Project & Process",
    "scrum": "Project & Process",
    "jira": "Project & Process",
    "kanban": "Project & Process",
    "pmp": "Project & Process",
    "itil": "Project & Process",
    "safe": "Project & Process",
    # Enterprise
    "sap": "Enterprise Platforms",
    "erp": "Enterprise Platforms",
    "salesforce": "Enterprise Platforms",
    "crm": "Enterprise Platforms",
    "saas": "Enterprise Platforms",
    "servicenow": "Enterprise Platforms",
    "workday": "Enterprise Platforms",
    "oracle erp": "Enterprise Platforms",
    # Networking
    "linux": "Networking & Systems",
    "windows server": "Networking & Systems",
    "nginx": "Networking & Systems",
    # Soft Skills
    "powerpoint": "Soft Skills",
    "communication": "Soft Skills",
    "leadership": "Soft Skills",
}
