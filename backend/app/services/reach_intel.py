"""Reach Intelligence — "who to reach out to" for a job, ADR-0018-clean.

Pure, deterministic, no LLM, no network. Given a job's title + description +
company, this derives *which roles to search for* and builds *search URLs the
user opens in their own browser*. Myro never fetches, parses, or stores the
result of those searches — it constructs the query and hands it to the user's
own logged-in session. That is the whole legal wall (ADR-0018): we are a smart
bookmark, not a people-data processor.

The free extension one-click and the free tier of the in-app Job Plan both call
this. LLM enrichment (outreach draft, timing) lives in the paid 50-coin pack,
not here.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import quote_plus

# Words that describe the candidate's OWN seniority — stripped when deriving the
# functional phrase to search for (we search for the team/function, then layer
# leader titles on top).
_SENIORITY_TOKENS = {
    "intern",
    "internship",
    "trainee",
    "graduate",
    "junior",
    "jr",
    "associate",
    "executive",
    "officer",
    "analyst",
    "specialist",
    "senior",
    "sr",
    "lead",
    "principal",
    "staff",
    "manager",
    "management",
    "head",
    "director",
    "vp",
    "vice",
    "president",
    "chief",
    "consultant",
}

# Employment-shape noise that shows up in scraped titles but is not functional.
_NOISE_TOKENS = {
    "full",
    "time",
    "fulltime",
    "part",
    "parttime",
    "permanent",
    "contract",
    "remote",
    "hybrid",
    "onsite",
    "wfh",
    "yrs",
    "years",
    "exp",
    "experience",
    "opening",
    "openings",
    "hiring",
    "job",
    "role",
    "position",
    "vacancy",
    "req",
    "requisition",
    "designation",
    "urgent",
    "immediate",
    "apply",
    "pune",
    "mumbai",
    "delhi",
    "bangalore",
    "bengaluru",
    "hyderabad",
    "chennai",
    "gurgaon",
    "gurugram",
    "noida",
    "kolkata",
    "india",
}

# "Reporting to : VP", "Reports to the Director of ...", "reporting into Head".
_REPORTING_RE = re.compile(
    r"report(?:s|ing)?\s*(?:to|into)\s*(?:the\s*)?[:\-]?\s*([A-Za-z][A-Za-z /&,'-]{1,60})",
    re.IGNORECASE,
)

# Leader titles we recognise inside a reporting line, longest first so "senior
# vice president" wins over "vice president".
_LEADER_TITLES = [
    "chief executive officer",
    "chief operating officer",
    "chief technology officer",
    "chief financial officer",
    "chief marketing officer",
    "senior vice president",
    "vice president",
    "svp",
    "vp",
    "avp",
    "general manager",
    "senior director",
    "associate director",
    "director",
    "senior manager",
    "head",
    "lead",
    "manager",
    "founder",
    "partner",
    "principal",
    "ceo",
    "coo",
    "cto",
    "cfo",
    "cmo",
]

_MAX_TITLE_WORDS = 6


@dataclass(frozen=True)
class ReachSearch:
    label: str
    url: str
    kind: str  # "linkedin" | "google"


@dataclass(frozen=True)
class ReachIntel:
    reporting_target: str | None  # leader title explicitly named in the JD, if any
    function: str  # functional phrase the role sits in (e.g. "Presales Data Analytics")
    target_titles: list[str]  # ranked people-titles to look for
    primary: ReachSearch | None  # the one opened on first click
    alternates: list[ReachSearch]  # shown in the reach-kit popup state


def extract_reporting_target(job_description: str) -> str | None:
    """Return the leader title the role explicitly reports to, if the JD says so.

    JDs frequently leak the hiring manager's *level* ("Reporting to : VP").
    That single line is the strongest, PII-free signal we have.
    """
    if not job_description:
        return None
    for match in _REPORTING_RE.finditer(job_description):
        phrase = match.group(1).strip().lower()
        for title in _LEADER_TITLES:
            if re.search(rf"\b{re.escape(title)}\b", phrase):
                return _titlecase_leader(title)
    return None


def _titlecase_leader(title: str) -> str:
    acronyms = {"vp", "svp", "avp", "ceo", "coo", "cto", "cfo", "cmo"}
    if title in acronyms:
        return title.upper()
    return " ".join(w.capitalize() for w in title.split())


def derive_function(job_title: str, company: str | None = None) -> str:
    """Strip seniority + location + employment noise (and the company name)
    from a job title, leaving the functional phrase to search for. "Netscribes
    - Manager - Presales - Data Analytics & Data Engineering" → "Presales Data
    Analytics Data Engineering". The company is dropped so it is not doubled
    when we later append it as a search keyword."""
    if not job_title:
        return ""
    raw = re.sub(r"[|·—]+", " - ", job_title)
    tokens = re.findall(r"[A-Za-z][A-Za-z+#.]*", raw)
    company_tokens = {
        t.lower() for t in re.findall(r"[A-Za-z][A-Za-z+#.]*", company or "") if len(t) > 1
    }
    kept: list[str] = []
    seen: set[str] = set()
    for tok in tokens:
        low = tok.lower()
        if low in _SENIORITY_TOKENS or low in _NOISE_TOKENS or low in company_tokens:
            continue
        if len(low) <= 1:
            continue
        if low in seen:
            continue
        seen.add(low)
        kept.append(tok)
        if len(kept) >= _MAX_TITLE_WORDS:
            break
    return " ".join(kept)


def build_target_titles(reporting_target: str | None, function: str) -> list[str]:
    """Ranked list of people-titles to search for. The explicit reporting
    target leads; then a small ladder of leader titles over the function so the
    search surfaces the team regardless of the exact title."""
    titles: list[str] = []

    def add(t: str) -> None:
        t = " ".join(t.split())
        if t and t.lower() not in {x.lower() for x in titles}:
            titles.append(t)

    fn = function.strip()
    if reporting_target:
        add(f"{reporting_target} {fn}".strip())
    if fn:
        add(f"Head of {fn}")
        add(f"Director {fn}")
        add(f"VP {fn}")
        add(fn)  # bare function surfaces the whole team, incl. senior ICs
    elif reporting_target:
        add(reporting_target)
    return titles


def _linkedin_people_url(keywords: str) -> str:
    return f"https://www.linkedin.com/search/results/people/?keywords={quote_plus(keywords)}"


def _google_linkedin_url(keywords: str) -> str:
    return f"https://www.google.com/search?q={quote_plus(keywords + ' site:linkedin.com/in')}"


def build_searches(target_titles: list[str], company: str | None) -> tuple[ReachSearch | None, list[ReachSearch]]:
    """The primary one-click search + a short list of alternates. Every URL is
    opened in the user's own browser session — Myro never fetches them."""
    company = (company or "").strip()
    if not target_titles:
        if not company:
            return None, []
        primary = ReachSearch(
            label=f"People at {company}",
            url=_linkedin_people_url(company),
            kind="linkedin",
        )
        return primary, [
            ReachSearch(
                label=f"{company} team on the web",
                url=_google_linkedin_url(company),
                kind="google",
            )
        ]

    def kw(title: str) -> str:
        return f"{title} {company}".strip()

    primary = ReachSearch(
        label=target_titles[0] + (f" · {company}" if company else ""),
        url=_linkedin_people_url(kw(target_titles[0])),
        kind="linkedin",
    )

    alternates: list[ReachSearch] = []
    for title in target_titles[1:4]:
        alternates.append(
            ReachSearch(
                label=title + (f" · {company}" if company else ""),
                url=_linkedin_people_url(kw(title)),
                kind="linkedin",
            )
        )
    # One Google→LinkedIn angle: surfaces named public profiles the LinkedIn
    # in-app search sometimes buries.
    alternates.append(
        ReachSearch(
            label=f"{target_titles[0]} on the web",
            url=_google_linkedin_url(kw(target_titles[0])),
            kind="google",
        )
    )
    return primary, alternates


def build_reach_intel(job_title: str, job_description: str, company: str | None) -> ReachIntel:
    """Compose the full deterministic reach intel for a job. No LLM, no network."""
    reporting_target = extract_reporting_target(job_description)
    function = derive_function(job_title, company)
    target_titles = build_target_titles(reporting_target, function)
    primary, alternates = build_searches(target_titles, company)
    return ReachIntel(
        reporting_target=reporting_target,
        function=function,
        target_titles=target_titles,
        primary=primary,
        alternates=alternates,
    )
