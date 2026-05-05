from __future__ import annotations

from collections.abc import Iterable

CANONICAL_INDUSTRY_GROUPS: tuple[str, ...] = (
    "BFSI",
    "Consulting & Professional Services",
    "Consumer & Retail",
    "Diversified",
    "Energy & Resources",
    "Healthcare & Life Sciences",
    "Logistics & Supply Chain",
    "Manufacturing & Industrial",
    "Media & Telecom",
    "Technology",
)


def _norm(value: str | None) -> str:
    return (value or "").strip().lower()


def _contains_any(text: str, keywords: Iterable[str]) -> bool:
    return any(keyword in text for keyword in keywords)


_ALIASES: dict[str, str] = {
    "bfsi": "BFSI",
    "banking / financial services": "BFSI",
    "banking": "BFSI",
    "financial services": "BFSI",
    "fintech": "BFSI",
    "consulting & professional services": "Consulting & Professional Services",
    "consulting": "Consulting & Professional Services",
    "professional services": "Consulting & Professional Services",
    "consumer & retail": "Consumer & Retail",
    "consumer goods": "Consumer & Retail",
    "retail": "Consumer & Retail",
    "energy & resources": "Energy & Resources",
    "energy": "Energy & Resources",
    "healthcare & life sciences": "Healthcare & Life Sciences",
    "healthcare": "Healthcare & Life Sciences",
    "pharmaceutical": "Healthcare & Life Sciences",
    "pharma": "Healthcare & Life Sciences",
    "life sciences": "Healthcare & Life Sciences",
    "logistics & supply chain": "Logistics & Supply Chain",
    "shipping / logistics": "Logistics & Supply Chain",
    "manufacturing & industrial": "Manufacturing & Industrial",
    "manufacturing": "Manufacturing & Industrial",
    "media & telecom": "Media & Telecom",
    "telecom": "Media & Telecom",
    "technology": "Technology",
    "it services": "Technology",
    "it consulting": "Technology",
    "technology / saas": "Technology",
    "e-commerce & technology": "Technology",
}


_DERIVATION_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "BFSI",
        (
            "bank",
            "financial",
            "fintech",
            "insurance",
            "payments",
            "wealth",
            "asset management",
            "capital markets",
            "trading",
        ),
    ),
    (
        "Healthcare & Life Sciences",
        (
            "healthcare",
            "health care",
            "pharma",
            "pharmaceutical",
            "biotech",
            "biopharma",
            "life science",
            "medical",
        ),
    ),
    (
        "Technology",
        (
            "technology",
            "tech",
            "software",
            "saas",
            "it service",
            "it consulting",
            "semiconductor",
            "e-commerce & technology",
            "developer",
            "cloud",
            "cyber",
        ),
    ),
    (
        "Manufacturing & Industrial",
        (
            "manufacturing",
            "industrial",
            "automotive",
            "aerospace",
            "defense",
            "engineering",
            "infrastructure",
            "chemical",
            "electrical",
            "machinery",
        ),
    ),
    (
        "Consulting & Professional Services",
        (
            "consulting",
            "advisory",
            "professional service",
            "strategy",
        ),
    ),
    (
        "Logistics & Supply Chain",
        (
            "logistics",
            "supply chain",
            "shipping",
            "freight",
            "transport",
            "railway",
            "air cargo",
        ),
    ),
    (
        "Consumer & Retail",
        (
            "retail",
            "consumer",
            "fmcg",
            "fashion",
            "luxury",
            "e-commerce",
        ),
    ),
    (
        "Energy & Resources",
        (
            "energy",
            "oil",
            "gas",
            "utility",
            "renewable",
            "mining",
        ),
    ),
    (
        "Media & Telecom",
        (
            "telecom",
            "telecommunications",
            "media",
            "entertainment",
            "advertising",
        ),
    ),
)


def normalize_industry_group(
    industry_group: str | None,
    industry: str | None,
) -> str | None:
    group_norm = _norm(industry_group)
    if group_norm:
        if group_norm in _ALIASES:
            return _ALIASES[group_norm]
        for canonical in CANONICAL_INDUSTRY_GROUPS:
            if group_norm == canonical.lower():
                return canonical

    raw = _norm(industry)
    if not raw:
        return None

    if raw in _ALIASES:
        return _ALIASES[raw]

    for canonical, keywords in _DERIVATION_RULES:
        if _contains_any(raw, keywords):
            return canonical

    # Keep analytics bounded to the same super-category set.
    return "Diversified"
