"""
cv_parser.py
Real CV → Lightcast skill extractor.

Pipeline:
  1. Extract text from PDF (pymupdf) or DOCX (python-docx)
  2. LLM extraction via OpenRouter — returns Lightcast-shaped skill names
  3. Validate each taxonomy_key against lightcast_skills_taxonomy.json
     (exact match → fuzzy fallback via difflib if no exact hit)
  4. Return signals matching the contract consumed by scoring_engine:
        {
          "skills_detected": [
            {"taxonomy_key", "xp_awarded", "signal_type", "evidence"}
          ],
          "raw_text": str
        }

Signal types and XP (unchanged from v1 stub contract):
  "mention"    → +50   (named in skills section only)
  "project"    → +150  (used in a real project or role)
  "impact"     → +350  (applied with measurable scale / metrics)
  "leadership" → +500  (led design / architecture using this skill)

Dependencies (already pinned in backend/requirements.txt):
  pymupdf, python-docx, openai.
"""

from __future__ import annotations

import io
import json
import logging
import re
from difflib import get_close_matches
from functools import lru_cache

from openai import AsyncOpenAI

from app.config import settings
from app.services.taxonomy_loader import _name_index, lookup_by_name

# pymupdf (fitz) and python-docx are imported lazily inside the extract_* helpers
# so that unit tests (and environments that don't parse PDFs) can import this
# module without those heavy dependencies being present.

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

_SIGNAL_XP: dict[str, int] = {
    "mention":    50,
    "project":    150,
    "impact":     350,
    "leadership": 500,
}
_VALID_SIGNALS: set[str] = set(_SIGNAL_XP.keys())

_MAX_SKILLS = 50
_FUZZY_THRESHOLD = 0.88
_CV_TEXT_CHAR_LIMIT = 15_000  # truncate very long CVs before sending to LLM
_MIN_RAW_TEXT_LEN = 80        # below this we assume scanned / empty CV

_OPENROUTER_BASE  = "https://openrouter.ai/api/v1"
_GROQ_BASE        = "https://api.groq.com/openai/v1"
_GEMINI_BASE      = "https://generativelanguage.googleapis.com/v1beta/openai/"
# Free tier first; direct Groq/Gemini if OpenRouter rate-limits; paid OR last resort
_OPENROUTER_MODELS = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-flash-1.5",
]


# ── Text extraction ───────────────────────────────────────────────────────────

def _extract_text_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF bytes using pymupdf (fitz). Lazy-imported."""
    import fitz  # pymupdf

    with fitz.open(stream=file_bytes, filetype="pdf") as doc:
        pages = [page.get_text("text") for page in doc]
    return "\n\n".join(pages).strip()


def _extract_text_docx(file_bytes: bytes) -> str:
    """Extract text from DOCX bytes using python-docx. Walks paragraphs + tables."""
    from docx import Document  # lazy import

    doc = Document(io.BytesIO(file_bytes))
    parts: list[str] = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                if cell.text.strip():
                    parts.append(cell.text.strip())
    return "\n".join(parts).strip()


# ── LLM extraction ────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are an expert CV analyst. Given a candidate's CV text, extract a comprehensive list of their professional skills using Lightcast/EMSI Open Skills standardized skill names.

For each skill include:
  - "taxonomy_key": the Lightcast skill name. Prefer canonical forms — e.g. "Python (Programming Language)" not just "Python", "SQL (Programming Language)" not "SQL", "Data Warehousing", "Stakeholder Management".
  - "signal_type": one of: "mention", "project", "impact", "leadership"
      mention    — named in a skills list only, no evidence of use
      project    — used in a real project, role, or product
      impact     — applied with measurable outcome / metrics / scale
      leadership — led design, architecture, or team using this skill
  - "evidence": a short phrase or sentence from the CV that justifies the signal (≤200 chars)

Rules:
  - Include hard skills, tools, methodologies, AND human/soft skills when evidenced
  - Skip generic filler ("Innovation", "Collaboration" alone) unless there is concrete evidence tied to a project/outcome
  - If the CV mentions a skill in multiple contexts, use the HIGHEST signal_type
  - Return 20–50 skills. Extract only what is evidenced — do not invent skills
  - Use proper Lightcast capitalisation (e.g. "Apache Spark", "Amazon Web Services (AWS)")

Return JSON only — no prose, no markdown fences. Shape:
{"skills": [{"taxonomy_key": "...", "signal_type": "...", "evidence": "..."}]}"""


async def _llm_extract(cv_text: str) -> list[dict]:
    """Try LM Studio → OpenRouter (free) → Groq → Gemini → OpenRouter (paid). Returns [] if all fail."""
    providers: list[tuple[AsyncOpenAI, str]] = []
    if settings.lm_studio_extractor_model:
        providers.append((
            AsyncOpenAI(api_key="lm-studio", base_url=settings.lm_studio_base_url),
            settings.lm_studio_extractor_model,
        ))
    if settings.openrouter_api_key:
        or_client = AsyncOpenAI(api_key=settings.openrouter_api_key, base_url=_OPENROUTER_BASE)
        providers.append((or_client, "meta-llama/llama-3.3-70b-instruct:free"))
    if settings.groq_api_key:
        providers.append((
            AsyncOpenAI(api_key=settings.groq_api_key, base_url=_GROQ_BASE),
            "llama-3.1-8b-instant",
        ))
    if settings.google_api_key:
        providers.append((
            AsyncOpenAI(api_key=settings.google_api_key, base_url=_GEMINI_BASE),
            "gemini-2.0-flash-lite",
        ))
    if settings.openrouter_api_key:
        providers.append((
            AsyncOpenAI(api_key=settings.openrouter_api_key, base_url=_OPENROUTER_BASE),
            "google/gemini-flash-1.5",
        ))

    if not providers:
        logger.error("No LLM configured for CV extraction — set OPENROUTER_API_KEY, GROQ_API_KEY, or GOOGLE_API_KEY")
        return []

    truncated = cv_text[:_CV_TEXT_CHAR_LIMIT]
    user_prompt = (
        f"CV text:\n---\n{truncated}\n---\n\n"
        "Extract the candidate's skills per the rules. Return JSON only."
    )

    for client, model in providers:
        logger.info("CV extraction using model: %s", model)
        try:
            resp = await client.chat.completions.create(
                model=model,
                max_tokens=2048,
                temperature=0,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user",   "content": user_prompt},
                ],
            )
            content = resp.choices[0].message.content or ""
            parsed = _parse_llm_json(content)
            if parsed:
                return parsed
            logger.warning("CV extraction: %s returned unparseable response — trying next provider", model)
        except Exception as exc:
            logger.warning("CV extraction failed with %s: %s — trying next provider", model, exc)

    logger.error("All CV extraction providers failed")
    return []


def _parse_llm_json(text: str) -> list[dict]:
    """Pull JSON out of an LLM response — tolerates code fences and prose."""
    if not text:
        return []

    # Strip markdown code fences
    if "```" in text:
        match = re.search(r"```(?:json)?\s*(.+?)```", text, flags=re.DOTALL)
        if match:
            text = match.group(1).strip()

    # Locate first JSON start
    start_obj = text.find("{")
    start_arr = text.find("[")
    starts = [s for s in (start_obj, start_arr) if s >= 0]
    if not starts:
        return []

    try:
        parsed, _ = json.JSONDecoder().raw_decode(text, min(starts))
    except json.JSONDecodeError:
        logger.warning("CV extractor: could not parse LLM response as JSON")
        return []

    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        # Expect {"skills": [...]} — but accept any list-valued field
        for v in parsed.values():
            if isinstance(v, list):
                return v
    return []


# ── Validation / Lightcast mapping ────────────────────────────────────────────

@lru_cache(maxsize=1)
def _lightcast_name_list() -> list[str]:
    """Cached lowercase list of all Lightcast names for fuzzy matching."""
    return list(_name_index().keys())


def _fuzzy_match(name: str) -> str | None:
    """Return the canonical Lightcast name if a close match exists."""
    norm = name.lower().strip()
    if not norm:
        return None
    candidates = get_close_matches(norm, _lightcast_name_list(), n=1, cutoff=_FUZZY_THRESHOLD)
    if not candidates:
        return None
    return _name_index()[candidates[0]].name


def _validate_and_normalize(raw_skills: list[dict]) -> list[dict]:
    """
    Keep only skills whose taxonomy_key resolves to a real Lightcast name.
    - Coerce signal_type to a known value (defaults to "mention")
    - Compute xp_awarded from signal_type
    - Dedupe by canonical name, keeping the highest-signal occurrence
    - Cap at _MAX_SKILLS, sorted by xp descending
    """
    best_by_key: dict[str, dict] = {}

    for raw in raw_skills[: _MAX_SKILLS * 2]:
        if not isinstance(raw, dict):
            continue

        name = str(raw.get("taxonomy_key") or raw.get("name") or "").strip()
        signal = str(raw.get("signal_type") or "mention").strip().lower()
        evidence = str(raw.get("evidence") or "").strip()

        if not name:
            continue
        if signal not in _VALID_SIGNALS:
            signal = "mention"

        # Resolve to canonical Lightcast name
        lc = lookup_by_name(name)
        canonical = lc.name if lc else _fuzzy_match(name)
        if canonical is None:
            logger.info("Dropped non-Lightcast skill from CV extraction: %r", name)
            continue

        new_xp = _SIGNAL_XP[signal]
        prev = best_by_key.get(canonical)
        if prev is None or prev["xp_awarded"] < new_xp:
            best_by_key[canonical] = {
                "taxonomy_key": canonical,
                "xp_awarded": new_xp,
                "signal_type": signal,
                "evidence": evidence[:300],
            }

    return sorted(best_by_key.values(), key=lambda s: -s["xp_awarded"])[:_MAX_SKILLS]


# ── Main entry point ──────────────────────────────────────────────────────────

async def parse_cv(file_bytes: bytes, file_type: str) -> dict:
    """
    Parse a CV and return detected skill signals mapped to Lightcast.

    Args:
        file_bytes: Raw bytes of the uploaded PDF or DOCX.
        file_type:  "pdf" or "docx".

    Returns:
        {"skills_detected": [
             {"taxonomy_key", "xp_awarded", "signal_type", "evidence"}
         ],
         "raw_text": str}

        Empty `skills_detected` signals to the caller that the file is likely
        scanned/empty or extraction failed — router should translate to HTTP 422.

    Raises:
        ValueError — unsupported file_type.
    """
    if file_type == "pdf":
        raw_text = _extract_text_pdf(file_bytes)
    elif file_type == "docx":
        raw_text = _extract_text_docx(file_bytes)
    else:
        raise ValueError(f"Unsupported file_type: {file_type!r}")

    if len(raw_text) < _MIN_RAW_TEXT_LEN:
        logger.warning("CV extracted text is too short (%d chars) — likely scanned", len(raw_text))
        return {"skills_detected": [], "raw_text": raw_text}

    raw_skills = await _llm_extract(raw_text)
    skills = _validate_and_normalize(raw_skills)
    logger.info(
        "CV parsed: %d chars → %d raw → %d validated Lightcast skills",
        len(raw_text), len(raw_skills), len(skills),
    )

    return {"skills_detected": skills, "raw_text": raw_text}
