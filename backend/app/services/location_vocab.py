"""Indian city → state vocabulary, read from ``public.location_vocab``.

The scraper owns the list (myro-job-scraper ``scraper/india_cities.json``) and
seeds this table from it, so the scraper and Myro cannot disagree about which
state Pune is in. CEO decision record 2026-10-04:

- Q1 a job with no city is shown to everyone in its country.
- Q2 a job naming only a state is shown to users whose cities sit in that state.
- Q6 "Delhi NCR" means the cities Delhi, Gurugram and Noida.

Read failures leave the vocabulary empty for one refresh window: state-only
jobs then fail closed (not shown), country-only jobs are unaffected.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger(__name__)

_REFRESH_SECONDS = 3600


@dataclass(frozen=True)
class Vocab:
    city_state: dict[str, str] = field(default_factory=dict)        # city/alias key → state
    city_canonical: dict[str, str] = field(default_factory=dict)    # city/alias key → canonical city
    state_names: dict[str, str] = field(default_factory=dict)       # state-only key → canonical state
    country_names: frozenset[str] = frozenset()
    metros: dict[str, tuple[str, ...]] = field(default_factory=dict)  # metro key → member cities


def build_vocab(rows: list[dict[str, Any]]) -> Vocab:
    city_state: dict[str, str] = {}
    city_canonical: dict[str, str] = {}
    state_names: dict[str, str] = {}
    countries: set[str] = set()
    metros: dict[str, list[str]] = {}
    for row in rows:
        kind = row.get("kind")
        key = str(row.get("key") or "").strip().casefold()
        canonical = str(row.get("canonical") or "").strip()
        state = str(row.get("state") or "").strip()
        if not key:
            continue
        if kind in ("city", "alias") and state:
            city_state[key] = state
            city_canonical[key] = canonical
        elif kind == "state" and state:
            state_names[key] = state
        elif kind == "country":
            countries.add(key)
        elif kind == "metro" and canonical:
            metros.setdefault(key, []).append(canonical)
    return Vocab(
        city_state=city_state,
        city_canonical=city_canonical,
        state_names=state_names,
        country_names=frozenset(countries),
        metros={key: tuple(sorted(members)) for key, members in metros.items()},
    )


_lock = threading.Lock()
_cached: Vocab | None = None
_loaded_at = 0.0


def _fetch_rows() -> list[dict[str, Any]]:
    from app.database import get_supabase_admin

    return (
        get_supabase_admin()
        .table("location_vocab")
        .select("kind, key, canonical, state")
        .limit(10000)
        .execute()
    ).data or []


def get_vocab() -> Vocab:
    global _cached, _loaded_at
    now = time.monotonic()
    if _cached is not None and now - _loaded_at < _REFRESH_SECONDS:
        return _cached
    with _lock:
        if _cached is not None and now - _loaded_at < _REFRESH_SECONDS:
            return _cached
        try:
            _cached = build_vocab(_fetch_rows())
        except Exception as exc:  # noqa: BLE001 — a lookup table must not break a feed
            log.warning("location_vocab unavailable: %s", exc)
            _cached = _cached or Vocab()
        _loaded_at = now
        return _cached


def set_vocab(vocab: Vocab | None) -> None:
    """Pin the vocabulary (tests) or clear it so the next read refetches."""
    global _cached, _loaded_at
    with _lock:
        _cached = vocab
        _loaded_at = time.monotonic() if vocab is not None else 0.0


def _key(value: Any) -> str:
    return " ".join(str(value or "").replace(",", " ").split()).casefold()


def state_of(place: Any) -> str | None:
    """The state of a known Indian city, alias or state name; None otherwise."""
    vocab = get_vocab()
    key = _key(place)
    return vocab.city_state.get(key) or vocab.state_names.get(key)


def is_state(place: Any) -> bool:
    return _key(place) in get_vocab().state_names


def is_country(place: Any) -> bool:
    return _key(place) in get_vocab().country_names


def canonical_city(place: Any) -> str | None:
    return get_vocab().city_canonical.get(_key(place))


def metro_cities(place: Any) -> tuple[str, ...]:
    """Member cities of a metro region ("Delhi NCR" → Delhi NCR, Gurugram, Noida)."""
    return get_vocab().metros.get(_key(place), ())
