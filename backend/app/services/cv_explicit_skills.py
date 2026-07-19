"""Fast, deterministic recovery of skills written literally in CV text.

The LLM is an enrichment layer, not the recall boundary.  This module builds a
cached, ambiguity-aware alias index over the Lightcast taxonomy and resolves
literal CV phrases in O(words * longest_alias) time.
"""
from __future__ import annotations

import re
from functools import lru_cache

from app.services.taxonomy_loader import get_all_skills, lookup_by_name

_TOKEN_RE = re.compile(r"(?u)[^\W_][\w+#./-]*")
_PAREN_RE = re.compile(r"^(.*?)\s*\(([^()]*)\)\s*$")

# Human shorthand that cannot safely be derived from string similarity.  Every
# value is a real Lightcast canonical key; import-time tests guard drift.
_EXPLICIT_ALIASES: dict[str, str] = {
    "html": "HyperText Markup Language (HTML)",
    "html5": "HTML5",
    "css": "Cascading Style Sheets (CSS)",
    "javascript": "JavaScript (Programming Language)",
    "js": "JavaScript (Programming Language)",
    "typescript": "TypeScript",
    "ts": "TypeScript",
    "python": "Python (Programming Language)",
    "sql": "SQL (Programming Language)",
    "mysql": "MySQL",
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "react": "React.js (Javascript Library)",
    "reactjs": "React.js (Javascript Library)",
    "react.js": "React.js (Javascript Library)",
    "nodejs": "Node.js (Javascript Library)",
    "node.js": "Node.js (Javascript Library)",
    "nextjs": "Next.js (Javascript Library)",
    "next.js": "Next.js (Javascript Library)",
    "c++": "C++ (Programming Language)",
    "c#": "C Sharp Software",
    "dotnet": ".NET Framework",
    ".net": ".NET Framework",
    "aws": "Amazon Web Services",
    "gcp": "Google Cloud Platform (GCP)",
    "azure": "Microsoft Azure",
    "ms excel": "Microsoft Excel",
    "excel": "Microsoft Excel",
    "power bi": "Power BI",
    "github": "GitHub",
    "gitlab": "GitLab",
    "docker": "Docker (Software)",
    "kubernetes": "Kubernetes",
    "mongodb": "MongoDB",
    "redis": "Redis",
    "fastapi": "FastAPI",
    "django": "Django (Web Framework)",
    "flask": "Flask (Web Framework)",
    "salesforce": "Salesforce",
    "tableau": "Tableau (Business Intelligence Software)",
    "figma": "Figma (Design Software)",
    "jira": "Jira",
}

_AMBIGUOUS_ALIASES = {
    "ai", "bi", "c", "go", "hr", "it", "ml", "r", "sap", "ui", "ux",
    "communication", "leadership", "management", "planning", "research",
}


def _tokens(value: str) -> tuple[str, ...]:
    return tuple(match.group(0).casefold().strip("-/") for match in _TOKEN_RE.finditer(value))


def _specific_aliases(canonical: str) -> set[tuple[str, ...]]:
    aliases: set[tuple[str, ...]] = set()
    full = _tokens(canonical)
    if len(full) >= 2:
        aliases.add(full)

    match = _PAREN_RE.match(canonical)
    if not match:
        return aliases

    base, _qualifier = match.groups()
    base_tokens = _tokens(base)
    base_key = " ".join(base_tokens)
    if (
        len(base_tokens) >= 2
        and len(base_key) >= 5
        and base_key not in _AMBIGUOUS_ALIASES
    ):
        aliases.add(base_tokens)
    return aliases


@lru_cache(maxsize=1)
def _alias_index() -> tuple[dict[tuple[str, ...], str], int]:
    candidates: dict[tuple[str, ...], str | None] = {}
    for skill in get_all_skills():
        for alias in _specific_aliases(skill.name):
            previous = candidates.get(alias)
            if previous is None and alias not in candidates:
                candidates[alias] = skill.name
            elif previous != skill.name:
                candidates[alias] = None

    # Curated aliases deliberately resolve taxonomy collisions.
    for alias, canonical in _EXPLICIT_ALIASES.items():
        if lookup_by_name(canonical) is None:
            raise RuntimeError(f"CV skill alias points to missing taxonomy key: {canonical}")
        candidates[_tokens(alias)] = canonical

    resolved = {alias: key for alias, key in candidates.items() if key is not None and alias}
    return resolved, max((len(alias) for alias in resolved), default=1)


def extract_explicit_skills(cv_text: str) -> list[dict[str, object]]:
    """Return canonical mention signals for unambiguous literal CV phrases."""
    if not cv_text.strip():
        return []

    index, max_words = _alias_index()
    matches = list(_TOKEN_RE.finditer(cv_text))
    normalized = [match.group(0).casefold().strip("-/") for match in matches]
    found: dict[str, dict[str, object]] = {}

    for start in range(len(matches)):
        for width in range(min(max_words, len(matches) - start), 0, -1):
            canonical = index.get(tuple(normalized[start : start + width]))
            if canonical is None or canonical in found:
                continue
            end = start + width - 1
            evidence = cv_text[matches[start].start() : matches[end].end()].strip()
            found[canonical] = {
                "taxonomy_key": canonical,
                "xp_awarded": 50,
                "signal_type": "mention",
                "evidence": evidence[:300],
                "origin": "deterministic_literal",
            }
            break

    return sorted(found.values(), key=lambda item: str(item["taxonomy_key"]).casefold())


def reconcile_skill_signals(
    deterministic: list[dict],
    enriched: list[dict],
) -> list[dict]:
    """Union both sources, keeping the strongest evidence for each canonical key."""
    best: dict[str, dict] = {}
    for item in [*deterministic, *enriched]:
        key = str(item.get("taxonomy_key") or "").strip()
        if not key:
            continue
        candidate = dict(item)
        candidate.setdefault("origin", "llm_enrichment")
        previous = best.get(key)
        if previous is None or int(candidate.get("xp_awarded") or 0) > int(
            previous.get("xp_awarded") or 0
        ):
            best[key] = candidate
    return sorted(
        best.values(),
        key=lambda item: (-int(item.get("xp_awarded") or 0), str(item["taxonomy_key"]).casefold()),
    )
