"""
services/matching/filter_spec.py — the canonical FilterSpec.

Before this, "what jobs to search for" was expressed three different ways:
  - the NL parser dict  {role, location_city, location_country, location_mode, skills}
  - the authed feed's long feed_jobs(**kwargs)
  - the intent-chat diff {add_roles, remove_roles, locations, seniority, work_mode, salary}

FilterSpec is the ONE structured filter vocabulary all of them map into. Producers
(``from_nl_parse`` / ``from_intent_diff`` / ``from_memory``) build a spec; the
``*_kwargs`` mappers translate it back into the exact keyword calls the tuned repo
SQL already understands. It does NOT re-implement any query — it is a description,
resolved by ``JobQuery`` (job_query.py). See CONTEXT.md "FilterSpec".
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# The one place the "remote|hybrid|onsite" vocabulary lives for filtering.
_WORK_MODES = {"remote", "hybrid", "onsite"}


def _mode(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    v = value.strip().lower()
    return v if v in _WORK_MODES else None


def _clean(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    v = value.strip()
    return v or None


@dataclass(frozen=True)
class FilterSpec:
    """A canonical, source-agnostic description of a job query.

    Every field is optional so a spec can carry as little as one role term (public
    search) or the full authed-feed dimension set. No field is a filter until a
    ``*_kwargs`` mapper hands it to a repo method that understands it — e.g.
    ``seniority`` / ``salary`` are targeting/memory facts the feed SQL doesn't take,
    so ``feed_kwargs`` simply omits them.
    """

    # Role intent
    roles: tuple[str, ...] = ()          # free-text role/title terms (public search + memory)
    role_domain: str | None = None       # a resolved jobs.role_domain (feed / company drill)
    seniority: str | None = None         # targeting fact — not a feed SQL filter today
    # Skills
    skills: tuple[str, ...] = ()          # named skills (NL parse / semantic re-rank, Phase 4)
    skill_facet: str | None = None        # the feed's single-skill facet dimension
    # Company scope (drill-down)
    company: str | None = None
    # Free text
    q: str | None = None
    # Location
    location_city: str | None = None
    location_country: str | None = None
    location_mode: str | None = None      # remote|hybrid|onsite
    location_prefs: tuple[str, ...] | None = None  # OR-across-chips scope; () = explicit-empty
    # Money (memory fact — never a feed SQL filter)
    salary: str | None = None
    # Feed shaping
    sort: str = "fresh"
    min_skill_matches: int = 0
    following_only: bool = False
    include_stretch: bool = False
    # Paging / bounds
    page: int = 1
    page_size: int = 20
    limit: int = 12                       # public search result bound

    # ── producers ────────────────────────────────────────────────────────────

    @classmethod
    def from_nl_parse(cls, parsed: dict[str, Any], *, limit: int = 12) -> "FilterSpec":
        """Landing NL search: the ``job_query_parser.parse_job_query`` output."""
        role = _clean(parsed.get("role"))
        skills = tuple(s for s in (parsed.get("skills") or []) if isinstance(s, str) and s.strip())
        return cls(
            roles=(role,) if role else (),
            skills=skills,
            location_city=_clean(parsed.get("location_city")),
            location_country=_clean(parsed.get("location_country")),
            location_mode=_mode(parsed.get("location_mode")),
            limit=limit,
        )

    @classmethod
    def from_intent_diff(cls, diff: dict[str, Any]) -> "FilterSpec":
        """Delta-4 intent chat: the confirmed ``proposed_diff`` as a query shape.

        The *persistence* of a confirmed diff still flows through the tested setters
        (intent_chat_service.apply_diff). This factory is the read-side twin — it
        expresses the same intent as a FilterSpec so a re-feed preview / Phase-2
        distillation speaks one filter vocabulary.
        """
        roles = tuple(t for t in (diff.get("add_roles") or []) if isinstance(t, str) and t.strip())
        locations = [loc for loc in (diff.get("locations") or []) if isinstance(loc, str) and loc.strip()]
        return cls(
            roles=roles,
            seniority=_clean(diff.get("seniority")),
            location_city=locations[0] if locations else None,
            location_mode=_mode(diff.get("work_mode")),
            location_prefs=tuple(locations) if locations else None,
            salary=_clean(diff.get("salary")),
        )

    @classmethod
    def from_memory(cls, facts: list[dict[str, Any]]) -> "FilterSpec":
        """Phase-2 memory → filter. Reads the structured `user_memory` kinds that
        shape a search (work_mode / salary / target_company / aspiration role text);
        ignores free-form context (that feeds the Phase-4 embedding re-rank, not a
        hard filter). Last-writer-wins per axis."""
        roles: list[str] = []
        mode = salary = company = None
        for f in facts:
            kind = (f.get("kind") or "").strip()
            text = _clean(f.get("text"))
            if not text:
                continue
            if kind == "work_mode":
                mode = _mode(text) or mode
            elif kind == "salary":
                salary = text
            elif kind == "target_company":
                company = text
            elif kind == "aspiration":
                roles.append(text)
        return cls(
            roles=tuple(roles),
            location_mode=mode,
            salary=salary,
            company=company,
        )

    # ── consumers (map to the tuned repo methods) ─────────────────────────────

    def public_kwargs(self) -> dict[str, Any]:
        """→ JobsRepository.public_job_query (landing NL search)."""
        return {
            "role": self.roles[0] if self.roles else "",
            "location_city": self.location_city,
            "location_country": self.location_country,
            "location_mode": self.location_mode,
            "limit": self.limit,
        }

    def feed_kwargs(self) -> dict[str, Any]:
        """→ JobsRepository.feed_jobs — the QUERY dimensions only. User-context
        (skill keys, target roles, exclusions, followed set) is injected by
        ``JobQuery.feed`` at resolve time, not carried on the spec."""
        return {
            "role_domain": self.role_domain,
            "q": self.q,
            "skill": self.skill_facet,
            "location_city": self.location_city,
            "location_country": self.location_country,
            "location_mode": self.location_mode,
            "location_prefs": list(self.location_prefs) if self.location_prefs is not None else None,
            "sort": self.sort,
            "min_skill_matches": self.min_skill_matches,
            "following_only": self.following_only,
            "include_stretch": self.include_stretch,
            "page": self.page,
            "page_size": self.page_size,
        }

    def company_drill_kwargs(self) -> dict[str, Any]:
        """→ JobsRepository.search_jobs_by_filters (company × skill drill-down)."""
        return {
            "company": self.company or "",
            "skill": self.skill_facet or "",
            "role_domain": self.role_domain,
            "location_city": self.location_city,
            "location_country": self.location_country,
            "location_mode": self.location_mode,
            "page": self.page,
            "page_size": self.page_size,
        }
