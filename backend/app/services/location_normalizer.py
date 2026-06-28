from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

LOCATION_PARSER_VERSION = "v1"

LocationMode = Literal["onsite", "hybrid", "remote", "unknown"]
LocationQuality = Literal["ok", "unknown"]

_SPACE_RE = re.compile(r"\s+")
_MULTI_LOCATION_RE = re.compile(r"\b\d+\s*locations?\b|multiple locations|various locations")
_REMOTE_RE = re.compile(r"\bremote\b|\bwork from home\b|\bwfh\b|\bworldwide\b|\banywhere\b")
_HYBRID_RE = re.compile(r"\bhybrid\b")

_CITY_ALIASES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bbangalore\b|\bbengaluru\b"), "Bengaluru"),
    (re.compile(r"\bhyderabad\b"), "Hyderabad"),
    (re.compile(r"\bpune\b"), "Pune"),
    (re.compile(r"\bmumbai\b"), "Mumbai"),
    (re.compile(r"\bchennai\b"), "Chennai"),
    (re.compile(r"\bnoida\b"), "Noida"),
    (re.compile(r"\bgurgaon\b|\bgurugram\b"), "Gurugram"),
    (re.compile(r"\bnew delhi\b|\bdelhi\b|\bncr\b"), "Delhi NCR"),
    (re.compile(r"\bkolkata\b"), "Kolkata"),
    (re.compile(r"\bahmedabad\b"), "Ahmedabad"),
    (re.compile(r"\bjaipur\b"), "Jaipur"),
    (re.compile(r"\bsan jose\b"), "San Jose"),
    (re.compile(r"\blondon\b"), "London"),
    (re.compile(r"\bsingapore\b"), "Singapore"),
)

_COUNTRY_ALIASES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bindia\b|(?:^|[,\s\-])in(?:$|[,\s\-])"), "India"),
    (re.compile(r"\bus\b|\busa\b|\bunited states\b|\bu\.s\.\b"), "United States"),
    (re.compile(r"\buk\b|\bunited kingdom\b"), "United Kingdom"),
    (re.compile(r"\bsingapore\b"), "Singapore"),
    (re.compile(r"\bcanada\b"), "Canada"),
    (re.compile(r"\bgermany\b"), "Germany"),
    (re.compile(r"\bfrance\b"), "France"),
    (re.compile(r"\bnetherlands\b"), "Netherlands"),
    (re.compile(r"\baustralia\b"), "Australia"),
    (re.compile(r"\buae\b|\bunited arab emirates\b"), "United Arab Emirates"),
    (re.compile(r"\bireland\b"), "Ireland"),
    (re.compile(r"\bpoland\b"), "Poland"),
    (re.compile(r"\bjapan\b"), "Japan"),
)

_INDIA_CITIES = {
    "Bengaluru",
    "Hyderabad",
    "Pune",
    "Mumbai",
    "Chennai",
    "Noida",
    "Gurugram",
    "Delhi NCR",
    "Kolkata",
    "Ahmedabad",
    "Jaipur",
}


@dataclass(frozen=True)
class NormalizedLocation:
    location: str | None
    location_raw: str | None
    location_city: str | None
    location_country: str | None
    location_mode: LocationMode
    location_quality: LocationQuality


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return _SPACE_RE.sub(" ", str(value).strip())


def _infer_mode(lower: str) -> LocationMode:
    if _HYBRID_RE.search(lower):
        return "hybrid"
    if _REMOTE_RE.search(lower):
        return "remote"
    return "unknown"


def _infer_city(lower: str, raw: str) -> str | None:
    for pattern, canonical in _CITY_ALIASES:
        if pattern.search(lower):
            return canonical

    token = re.split(r"[;,|]", raw, maxsplit=1)[0]
    token = re.split(r"\s+-\s+", token, maxsplit=1)[0].strip()
    if not token:
        return None
    token_lower = token.lower()
    if _infer_country(token_lower) is not None:
        return None
    if any(
        bad in token_lower
        for bad in ("location", "remote", "hybrid", "worldwide", "anywhere", "onsite")
    ):
        return None
    if re.search(r"\d", token):
        return None
    if len(token) < 2:
        return None
    return _SPACE_RE.sub(" ", token.title())


def _infer_country(lower: str) -> str | None:
    for pattern, canonical in _COUNTRY_ALIASES:
        if pattern.search(lower):
            return canonical
    return None


def _display_location(
    *,
    city: str | None,
    country: str | None,
    mode: LocationMode,
    raw: str | None,
    quality: LocationQuality,
) -> str | None:
    if quality == "unknown":
        return raw
    if mode == "remote":
        return f"Remote - {country}" if country else "Remote"
    if mode == "hybrid":
        if city and country:
            return f"Hybrid - {city}, {country}"
        if city:
            return f"Hybrid - {city}"
        if country:
            return f"Hybrid - {country}"
        return "Hybrid"
    if city and country:
        return f"{city}, {country}"
    return city or country or raw


def normalize_location(value: Any) -> NormalizedLocation:
    raw = _clean_text(value) or None
    if raw is None:
        return NormalizedLocation(
            location=None,
            location_raw=None,
            location_city=None,
            location_country=None,
            location_mode="unknown",
            location_quality="unknown",
        )

    lower = raw.lower()
    mode = _infer_mode(lower)
    country = _infer_country(lower)
    city = _infer_city(lower, raw)

    if city in _INDIA_CITIES and not country:
        country = "India"

    is_multi_location = _MULTI_LOCATION_RE.search(lower) is not None
    if mode == "unknown" and city is None and country is None:
        quality: LocationQuality = "unknown"
    elif is_multi_location and mode == "unknown":
        quality = "unknown"
        city = None
    else:
        quality = "ok"

    if mode == "unknown" and (city is not None or country is not None) and quality == "ok":
        mode = "onsite"

    location = _display_location(
        city=city,
        country=country,
        mode=mode,
        raw=raw,
        quality=quality,
    )
    return NormalizedLocation(
        location=location,
        location_raw=raw,
        location_city=city,
        location_country=country,
        location_mode=mode,
        location_quality=quality,
    )


def derive_location_columns(locations: list[str]) -> dict[str, Any]:
    """Canonical multi-location preference → the four synced profile columns.

    `target_locations` (the freeform labels) is canonical. `target_location` and
    `target_location_country` are element-0 projections kept for legacy readers;
    `target_location_countries` is the deduped country set for the country-only
    match pipeline. One derivation point so the four never drift.
    """
    cleaned = [loc.strip() for loc in locations if loc and loc.strip()]
    countries: list[str] = []
    for loc in cleaned:
        country = normalize_location(loc).location_country
        if country and country not in countries:
            countries.append(country)
    return {
        "target_locations": cleaned,
        "target_location_countries": countries,
        "target_location": cleaned[0] if cleaned else None,
        "target_location_country": countries[0] if countries else None,
    }
