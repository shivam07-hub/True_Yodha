"""
CV Parsing service.
Downloads a PDF CV, extracts text, sends to OpenAI for structured extraction.
Falls back to mock data if no API key is configured.
"""

import json
import logging
import tempfile
from pathlib import Path

from app.schemas import ParsedCV
from app.config import LLM_PROVIDER
from app.llm_provider import call_llm, is_configured

logger = logging.getLogger(__name__)

# ── Prompt for structured CV extraction ──────────────────────────────

CV_EXTRACTION_PROMPT = """You are an expert resume/CV parser. Extract structured data from the following CV text.

Return ONLY valid JSON with exactly these fields:
{
  "skills": ["skill1", "skill2", ...],
  "years_experience": 4.0,
  "job_titles": ["most recent title", "previous title", ...],
  "education": "Degree, Institution",
  "industries": ["industry1", "industry2"],
  "summary": "2-3 sentence professional summary of the candidate"
}

Rules:
- "skills" should be lowercase, individual technologies/tools/frameworks (e.g., "python", "sql", "aws", "docker", "machine learning", "react", "java", "kubernetes", "spark", "airflow", "terraform", "postgresql", "mongodb", "git", "rest api", "graphql")
- Extract ALL technical skills, programming languages, frameworks, tools, cloud platforms, and methodologies mentioned
- "years_experience" should be a number (float). Estimate from the CV timeline if not stated explicitly.
- "job_titles" should be ordered most recent first
- "industries" should be broad categories like "Technology", "Finance", "Healthcare", "Consulting", etc.
- "summary" should highlight the candidate's strengths and career trajectory

CV TEXT:
{cv_text}
"""


def _extract_text_from_pdf(pdf_path: str | Path) -> str:
    """Extract text from a PDF file using pdfplumber."""
    import pdfplumber

    text_parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n\n".join(text_parts)


def _download_file(url: str, dest_path: str) -> None:
    """Download a file from URL to local path."""
    import httpx

    # Handle Google Drive URLs — convert to direct download format
    if "drive.google.com" in url:
        if "/file/d/" in url:
            file_id = url.split("/file/d/")[1].split("/")[0]
            url = f"https://drive.google.com/uc?export=download&id={file_id}"
        elif "id=" in url:
            pass  # already in direct download format

    with httpx.Client(follow_redirects=True, timeout=30.0) as client:
        response = client.get(url)
        response.raise_for_status()
        with open(dest_path, "wb") as f:
            f.write(response.content)


_CV_SYSTEM = "You are a precise CV parser. Return only valid JSON."


def _call_llm(prompt: str) -> str:
    """Call the configured LLM provider and return the response text."""
    return call_llm(_CV_SYSTEM, prompt, max_tokens=2000, temperature=0.1)


def _parse_openai_response(raw_response: str) -> dict:
    """Parse the JSON response from OpenAI, handling markdown fences."""
    text = raw_response.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json) and last line (```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)
    return json.loads(text)


async def parse_cv(cv_file_url: str, years_experience_hint: str | None = None) -> ParsedCV:
    """
    Parse a CV PDF into a structured profile.

    1. Download PDF from URL (Google Drive or direct link)
    2. Extract text with pdfplumber
    3. Send to OpenAI for structured extraction
    4. Return ParsedCV

    Falls back to mock data if the active provider's API key is not set.
    """
    if not is_configured():
        logger.warning(f"[MOCK] No API key for provider '{LLM_PROVIDER}' — returning mock CV profile")
        return _mock_cv(years_experience_hint)

    # ── 1. Download the PDF ──────────────────────────────────────────
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        logger.info(f"Downloading CV from: {cv_file_url}")
        _download_file(cv_file_url, tmp_path)
        logger.info(f"CV downloaded to: {tmp_path}")

        # ── 2. Extract text ──────────────────────────────────────────
        raw_text = _extract_text_from_pdf(tmp_path)
        if not raw_text or len(raw_text) < 50:
            logger.warning("PDF text extraction returned very little text. CV may be image-based.")
            raw_text = raw_text or "[Could not extract text from PDF]"
        logger.info(f"Extracted {len(raw_text)} chars from CV PDF")

    finally:
        Path(tmp_path).unlink(missing_ok=True)

    # ── 3. Send to OpenAI ────────────────────────────────────────────
    # Truncate to ~8K chars to stay within token limits
    cv_text_truncated = raw_text[:8000]
    prompt = CV_EXTRACTION_PROMPT.format(cv_text=cv_text_truncated)

    logger.info(f"Sending CV to LLM (provider={LLM_PROVIDER}) for structured extraction...")
    raw_response = _call_llm(prompt)
    logger.info(f"LLM response received ({len(raw_response)} chars)")

    # ── 4. Parse response ────────────────────────────────────────────
    try:
        data = _parse_openai_response(raw_response)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse OpenAI response as JSON: {e}")
        logger.error(f"Raw response: {raw_response[:500]}")
        return _mock_cv(years_experience_hint, raw_text=raw_text)

    return ParsedCV(
        skills=[s.strip().lower() for s in data.get("skills", [])],
        years_experience=data.get("years_experience"),
        job_titles=data.get("job_titles", []),
        education=data.get("education"),
        industries=data.get("industries", []),
        summary=data.get("summary"),
        raw_text=raw_text,
    )


def _mock_cv(years_experience_hint: str | None = None, raw_text: str = "") -> ParsedCV:
    """Return a mock CV profile for testing without API keys."""
    return ParsedCV(
        skills=[
            "python", "sql", "aws", "docker", "kubernetes",
            "machine learning", "pandas", "spark", "airflow",
            "terraform", "git", "rest api", "postgresql", "redis",
        ],
        years_experience=4.0,
        job_titles=["Data Engineer", "Software Engineer", "ML Engineer"],
        education="B.Tech Computer Science, IIT Delhi",
        industries=["Technology", "Finance"],
        summary=(
            "Data engineer with 4 years of experience building data pipelines "
            "and ML infrastructure. Strong Python/SQL skills with cloud (AWS) "
            "and orchestration (Airflow, Spark) experience."
        ),
        raw_text=raw_text or "[Mock CV text]",
    )
