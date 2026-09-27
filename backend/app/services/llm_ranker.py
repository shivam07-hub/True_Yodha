"""
llm_ranker.py
Stage-2 of the matcher: the Matching Brain.

Per shortlisted job, runs the Career Ops 5-axis evaluation (role/comp/growth/
culture/risk) + grade + Apply/Negotiate/Skip verdict + application angle +
strengths/concerns, judged against the candidate's CV and targeting profile.

Ported (not imported) from firecrawl_Supabase/career_ops_agent/prompts.py and
de-biased: the single-candidate (NCR / GTM-only) hard rules are replaced by the
per-user profile (target_roles + location). See docs/MATCHING_BRAIN_CHANGE.md.

Cost control:
  - One LLM call PER job over the top ~12 — richer but pricier than the old single
    batched call. XP economy bump is deferred (measure first).
  - Result cached in user_job_matches permanently per (user, job) — Backlog #36
    de-weekly; reused across scrapes/opens, overwritten on re-eval (CV upload,
    force refresh).

Provider chain is managed by LLMProvider (services/llm_provider.py).
Called from: the Job Refresh seam (services/job_refresh/) and the
CV-upload fire-and-forget initial-match compute (services/cv_workflow.py).
"""

import asyncio
import json
import logging
import re
from datetime import date, datetime, timezone
from collections.abc import Callable
from typing import Any

from supabase import Client

from app.services import deal_breakers, reader_voice
from app.services.llm_provider import LLMProvider, LLMProviderError
from app.services.model_outcome import ModelOutcome

logger = logging.getLogger(__name__)

_MAX_TOKENS = 1000
_RECOMMENDATIONS = {"Apply", "Negotiate", "Skip"}
_LEGITIMACY_TIERS = {"high_confidence", "caution", "suspicious"}
_CTC_BASES = {"stated", "estimated"}
# Bound on concurrent per-job LLM calls. Keep low — the provider chain fails over
# per call and free tiers rate-limit. See docs/MATCHING_BRAIN_CHANGE.md risks.
_CONCURRENCY = 3


# ── Prompt building ───────────────────────────────────────────────────────────

def preferred_locations(profile: dict[str, Any]) -> str:
    """Every location the user named, as the prompt should read it.

    Was `target_location or target_location_country`. For a user who said
    "Mumbai, Bangalore is also fine" that rendered one city — or, when only the
    array was set and the scalar was null, fell through to the country and
    turned two cities into "India". The brain then rewarded the wrong half of
    the search it was told to reward.
    """
    raw = profile.get("target_locations")
    values = raw if isinstance(raw, list) else [profile.get("target_location")]
    seen: list[str] = []
    for value in values:
        text = str(value or "").strip()
        if text and text.casefold() not in {s.casefold() for s in seen}:
            seen.append(text)
    if seen:
        return ", ".join(seen)
    countries = profile.get("target_location_countries")
    if isinstance(countries, list):
        named = [str(c).strip() for c in countries if str(c or "").strip()]
        if named:
            return ", ".join(named)
    return str(profile.get("target_location_country") or "").strip() or "flexible"


# What the prompt says when the user never told us what they want.
#
# It used to say "their stated target roles" — a self-referential placeholder
# that reads to the model exactly like a failed interpolation, handed to it under
# the rule "reward strong alignment with the candidate's target roles; penalise
# roles far outside them". The model cannot align anything to that phrase, so it
# returned a confident verdict against nothing, and that verdict persisted to
# `user_job_matches` and ordered the user's Best-fit feed. 141 users are in this
# state today.
#
# `deal_breakers` two lines below already had the honest form: a named absence
# ("none specified") plus a rule saying what to do about it. This mirrors it.
NO_TARGET_ROLES = "not set"

#: What the brain is TOLD, versioned. `onboarding_service.eval_context_key` hashes
#: this, so moving it re-rates every cached verdict the next time its user runs a
#: Search — the forward pass, not a backfill. Bump it when the prompt's rules or
#: its output shape change; leave it alone for wording that cannot change an
#: answer.
#: v2 (2026-09-16): the direction rule + `pick_reason`.
#: v3 (2026-09-27): `growth_fit` is scored only when a career goal is actually
#: on file. The previous prompt printed "Career goal: not specified" and still
#: asked for the score. Cached rows are not rewritten; until each user returns
#: and is re-rated, the feed holds both vintages.
#: v4 (2026-09-28): deal-breakers split into a pay floor and numbered won't-take
#: lines; the brain names the lines a posting breaks and estimates its pay band.
#: Pay never makes a Skip.
PROMPT_VERSION = "v4-pay-band-breaks"

#: Literal non-answers that have been stored as a career goal. The prod case is
#: a column of "No". Scoring growth against that is the same failure as scoring
#: it against "not specified".
_NOT_A_GOAL = {
    "no", "yes", "n/a", "na", "none", "nil", "nothing", "-", "--", "idk",
    "i don't know", "i dont know", "not sure", "tbd", "?", ".",
    "not specified",
}


def _stated(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    folded = re.sub(r"[^a-z0-9/' ]", "", text.lower())
    if folded in _NOT_A_GOAL:
        return None
    return text


def career_goal_of(profile: dict[str, Any]) -> str | None:
    """The goal the brain can actually see, or nothing.

    The column wins. When it is empty, an `aspiration` fact already riding in
    `known_facts` counts — that is the memory fallback, and it is the only
    reason a goal reaches the prompt for anyone beyond the two filled columns.
    A missing goal is omitted, never rendered as "not specified".
    """
    column = _stated(profile.get("career_goal"))
    if column:
        return column
    for fact in profile.get("known_facts") or []:
        text = str(fact).strip()
        prefix, _, body = text.partition(":")
        if prefix.strip().casefold() == "aspiration":
            stated = _stated(body)
            if stated:
                return stated
    return None


def superpower_of(profile: dict[str, Any]) -> str | None:
    """Column only. There is no memory kind for this, and a blank is not a power."""
    return _stated(profile.get("superpower"))


def gate_growth_fit(profile: dict[str, Any], parsed: dict[str, Any]) -> dict[str, Any]:
    """Drop a growth score the model produced against no goal.

    The prompt already says to return null. This is the write: a number judged
    against nothing must not be stored, even when the model ignores that line.
    """
    if career_goal_of(profile) is None:
        parsed["growth_fit"] = None
    return parsed


def gate_verdict(profile: dict[str, Any], parsed: dict[str, Any]) -> dict[str, Any]:
    """Every rule the prompt states that the write must not trust the model on.

    Growth judged against no goal is dropped. A posting that breaks a won't-take
    line is a Skip, whatever the model recommended — the list, the picks and the
    recommended flag all hide a Skip, so this is the one place a deal-breaker is
    enforced. `breaks` leaves as the person's own words, so the stored verdict
    says which line it honoured even after they edit the list.
    """
    gate_growth_fit(profile, parsed)
    broken = deal_breakers.read(profile).broken(list(parsed.get("breaks") or []))
    parsed["breaks"] = broken
    if broken:
        parsed["recommendation"] = "Skip"
    return parsed


def _ctc_band(value: Any) -> tuple[float | None, float | None]:
    """`[low, high]` in LPA, ordered, or nothing. A single number is not a band."""
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        return None, None
    low = _clamp(value[0], 0.0, 2000.0, None)
    high = _clamp(value[1], 0.0, 2000.0, None)
    if low is None or high is None or high == 0.0:
        return None, None
    return (low, high) if low <= high else (high, low)


def build_system_prompt(profile: dict[str, Any], cv_markdown: str) -> str:
    """Career Ops evaluator persona, driven by the per-user profile.

    Unlike the source agent, this carries NO hardcoded location/role bias — the
    rewards and penalties come from the candidate's own target_roles and location.
    """
    roles = ", ".join(profile.get("target_roles") or []) or NO_TARGET_ROLES
    location = preferred_locations(profile)
    stated = deal_breakers.read(profile)
    wont_take = (
        "; ".join(f"{i}) {line}" for i, line in enumerate(stated.wont_take, start=1))
        or "none stated"
    )
    career_goal = career_goal_of(profile)
    superpower = superpower_of(profile)
    cv_block = (cv_markdown or "").strip()[:4000] or "No CV on file — infer from the skill profile."
    identity = [
        f"- Target roles: {roles}",
        f"- Preferred locations: {location}",
    ]
    if career_goal:
        identity.append(f"- Career goal: {career_goal}")
    if superpower:
        identity.append(f"- Superpower: {superpower}")
    identity.append(f"- Won't take: {wont_take}")
    if stated.pay_floor_lpa is not None:
        identity.append(f"- Pay floor: ₹{stated.pay_floor_lpa:g} LPA")
    identity_block = "\n".join(identity)
    if career_goal:
        growth_axis = (
            f"- growth_fit: will this move the candidate toward this career goal: {career_goal}?"
        )
        growth_rule = f"- Judge growth_fit against the career goal above ({career_goal})."
        growth_schema = '"growth_fit": float,'
    else:
        growth_axis = (
            "- growth_fit: null. There is no career goal on file, so this dimension is not scored."
        )
        growth_rule = "- growth_fit MUST be null. Do not invent a trajectory and do not score one."
        growth_schema = '"growth_fit": null,'
    if superpower:
        angle_rule = f"- Frame application_angle around this superpower: {superpower}."
    else:
        angle_rule = (
            "- Frame application_angle from the CV. There is no stated superpower; do not invent one."
        )

    # Targeting Brief: memory facts (authored + distilled) ride as known_facts —
    # the same key the intent-chat concierge reads. Soft context, never hard rules.
    facts = [str(f).strip() for f in (profile.get("known_facts") or []) if str(f).strip()]
    facts_block = ""
    if facts:
        lines = "\n".join(f"- {f}" for f in facts)
        facts_block = f"\n\nWhat Myro remembers about this candidate (their notes + observed activity):\n{lines}"

    return f"""You are Career Ops, an elite AI career advisor. You evaluate a job posting against ONE specific candidate with brutal honesty and strategic insight. No flattery, no score inflation.

This candidate:
{identity_block}{facts_block}

CV:
{cv_block}

Score the posting on a 0.0–5.0 scale (use decimals; NEVER round to whole numbers):
- role_fit: match to skills, experience, seniority, and the candidate's target roles
- comp_fit: likely compensation vs the candidate's pay floor, or their level/market when no floor is set (infer if undisclosed)
{growth_axis}
- culture_fit: alignment with the candidate's work style and the org implied
- risk_score: stability / over-qualification / mis-fit risk (HIGHER = riskier)

Grade mapping: 4.5+ = A+, 4.0+ = A, 3.5+ = B+, 3.0+ = B, 2.5+ = C+, 2.0+ = C, below = D/F.

Also classify and legitimacy-check the posting (Career Ops Block A + Block G):
- archetype: the role's archetype in 1-3 words (e.g. "Data Scientist", "Product Manager", "Solutions Architect", "LLMOps", "Sales / GTM"). If hybrid, name the two closest joined by "/".
- legitimacy_tier: judge whether this is a real, live, worth-applying posting from the description ALONE (you have no web access):
    "high_confidence" — specific tech stack + team/scope detail, salary or clear responsibilities, no contradictions.
    "caution"         — vague or boilerplate-heavy, generic responsibilities, thin detail, or mild contradictions.
    "suspicious"      — ghost/scam signals: no real scope, pay-to-apply / upfront-fee language, contradictory seniority vs pay, mass-generic "rockstar/ninja" filler with no substance, or a JD that reads like a template with nothing concrete.
- legitimacy_reason: one short phrase naming the strongest signal behind the tier (e.g. "detailed stack + scope", "boilerplate, no specifics", "asks for an upfront fee").

Then give this specific candidate their strategy for THIS posting (Career Ops strategy block):
- level_strategy: one honest sentence on the candidate's level vs this role and how to play it (e.g. "at level — apply directly", "slightly below level; lead with growth and adjacent wins", "over-qualified; frame as a deliberate pivot"). When the title's seniority is ambiguous, judge it from the JD scope, NOT the title string.
- personalization: 2-3 sentences on how THIS candidate should tailor their application — what to lead with, which of THEIR experiences to foreground, what gap to pivot around. Ground every claim in the CV above; never invent experience.
- star_pointers: a JSON array of 2-4 SHORT phrases naming the candidate's OWN most-relevant projects/achievements to cite for this role, taken verbatim-in-spirit from the CV above. NO fabrication (ADR-0016): include ONLY real items present in the CV; if nothing is clearly relevant, return [].

Rules:
- Reward strong alignment with the candidate's target roles; penalise roles far outside them. ("not set" means the candidate has NOT told us what they want: judge role fit from the CV alone, and do not penalise distance from a target that does not exist.)
- Reward the candidate's preferred location; flag relocation risk otherwise (do not hard-fail).
- If the posting clearly breaks a won't-take line, list that line's number in `breaks`, recommendation MUST be "Skip", and the summary must name the line. ("none stated" means no hard filters.)
- Pay never makes a posting Skip. Give `ctc_lpa`: the annual CTC band in INR lakhs for THIS title at THIS company in THIS city at this level, as [low, high]. If the posting states pay, use it and set ctc_basis "stated". Otherwise estimate it from what this company and its direct competitors pay for the same title and level (salary surveys, published bands), set ctc_basis "estimated", and keep the band honest rather than narrow. null only when you cannot place the company or the level at all.
{growth_rule}
{angle_rule}
- If overall_score < 3.5, recommendation MUST be "Skip" and summary must say why not to apply.
- PAST SKILLS QUALIFY A CANDIDATE; THEY DO NOT SET THEIR DIRECTION. A posting that leans on skills from the candidate's past while moving them away from the target roles above is at best a deliberate pivot: say so in the summary, and do not let old skills alone carry role_fit. A candidate whose CV shows SQL and whose target is sales is not a data engineer.
- Apply is a recommendation to spend an application. Use "Apply" only at 4.0+; 3.5-3.9 is "Negotiate" at best — worth a look for a specific reason, not a role to lead with.

Respond ONLY with valid JSON, no prose outside it, matching exactly:
{{
  "overall_score": float,
  "grade": "A+|A|A-|B+|B|B-|C+|C|C-|D|F",
  "role_fit": float,
  "comp_fit": float,
  {growth_schema}
  "culture_fit": float,
  "risk_score": float,
  "summary": "2-3 sentence honest summary",
  "pick_reason": "ONE or TWO sentences said TO the candidate, in second person",
  "strengths": ["...", "..."],
  "concerns": ["...", "..."],
  "recommendation": "Apply|Negotiate|Skip",
  "application_angle": "1-2 sentences on how THIS candidate should position themselves if applying",
  "archetype": "1-3 word role archetype",
  "legitimacy_tier": "high_confidence|caution|suspicious",
  "legitimacy_reason": "short phrase naming the strongest signal",
  "level_strategy": "one sentence on level fit + how to play it",
  "personalization": "2-3 sentences tailoring THIS candidate's application, grounded in the CV",
  "star_pointers": ["real CV project/achievement to cite", "..."],
  "ctc_lpa": [low, high],
  "ctc_basis": "stated|estimated",
  "breaks": [numbers of the won't-take lines this posting breaks]
}}

`pick_reason` is the ONLY field the candidate reads themselves, and it is written TO them:
- Address them as "you" and "your". NEVER "the candidate", "they", "their", "this person" — a single slip turns their own shortlist into a file being discussed about them, and the line is DELETED before they see it.
- Say the specific thing that makes this job worth their time, and the one thing that does not. Name a skill, a title or a city — never "strong alignment" or "great opportunity".
- If it moves them away from the target roles above, say that in plain words.
- No filler: no "leverage", "robust", "seamless", "landscape", "showcase", "in today's".
- Two sentences maximum. It sits on a card."""


def build_job_context(job: dict[str, Any]) -> str:
    """Render one shortlisted job for the evaluator.

    `job` is a get_top_matches() result: title/company/location/industry/
    matched_skills/description/overlap_score.
    """
    matched = ", ".join(job.get("matched_skills") or []) or "n/a"
    return f"""Job Title: {job.get('title')}
Company: {job.get('company') or 'n/a'}
Industry: {job.get('industry') or 'n/a'}
Location: {job.get('location') or 'n/a'}
Skills this candidate already matches: {matched}
Deterministic skill-overlap score (0–100): {job.get('overlap_score')}

Job Description:
{(job.get('description') or 'No description available')[:6000]}"""


# ── Tier-1 triage (cheap, batched: pool → shortlist) ──────────────────────────
# Career-Ops shape: a deterministic pre-filter (role-title + location + freshness +
# skill-overlap) hands the brain a POOL of candidates (~tens), and ONE cheap batched
# call picks the best-fit shortlist. Only that shortlist then gets the expensive
# per-job 5-axis "why it fits" reasoning (evaluate_all). This is how we rate against
# the whole relevant pool without paying a deep eval per pool job.

_TRIAGE_MAX_TOKENS = 500
# Per-job description slice in the triage prompt — enough to judge fit, small enough
# to keep the pool inside every provider's context window.
_TRIAGE_SNIPPET = 220
# Max jobs in ONE triage LLM call. A larger pool is triaged as a tournament: chunks
# of this size run in parallel, each yields its best keep_n, and the winners triage
# again until they fit one call. This lets the POOL grow large (more role-relevant
# candidates reach the brain) while every prompt stays inside the free-provider
# context window and keeps triage quality high (a model ranks 50 rows far better
# than 300). Must stay > any realistic keep_n so the tournament always converges.
_TRIAGE_CHUNK = 50



def build_triage_prompt(profile: dict[str, Any], cv_markdown: str) -> str:
    """Compact evaluator persona for the batched pool→shortlist triage pass."""
    roles = ", ".join(profile.get("target_roles") or []) or NO_TARGET_ROLES
    location = preferred_locations(profile)
    cv_block = (cv_markdown or "").strip()[:2000] or "No CV on file — infer from the skill profile."
    return f"""You are Career Ops, an elite AI career advisor triaging a batch of job postings for ONE candidate. Pick only the strongest genuine fits — never pad the list to reach the count. Judge on true role/skill/seniority fit to THIS candidate, not keyword overlap.

Candidate target roles: {roles} ("not set" = judge role fit from the CV alone; do not penalise distance from a target that does not exist)
Preferred locations: {location}

CV:
{cv_block}"""


def build_triage_user(pool_jobs: list[dict[str, Any]], keep_n: int) -> str:
    """Numbered pool for the triage call. Uses 1-based indices (robust — the model
    echoes small integers, never mangled job_ids)."""
    lines = []
    for i, job in enumerate(pool_jobs, start=1):
        matched = ", ".join((job.get("matched_skills") or [])[:8]) or "n/a"
        snippet = " ".join((job.get("description") or "").split())[:_TRIAGE_SNIPPET]
        lines.append(
            f"{i}. {job.get('title')} — {job.get('company') or 'n/a'} "
            f"| {job.get('location') or 'n/a'} | matched: {matched} | overlap: {job.get('overlap_score')}"
            f"\n   {snippet}"
        )
    listing = "\n".join(lines)
    return f"""{len(pool_jobs)} candidate postings below. Select the {keep_n} BEST-FIT for this candidate, ranked best-first. Fewer is fine if fewer are genuinely strong — do NOT include weak fits to reach {keep_n}.

{listing}

Respond ONLY with valid JSON, no prose:
{{"shortlist": [<index>, <index>, ...]}}"""


def parse_triage(text: str, pool_size: int, keep_n: int) -> list[int] | None:
    """Parse the triage JSON → 0-based pool indices. None on unparseable output."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    if "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    if start == -1:
        return None
    try:
        obj, _ = json.JSONDecoder().raw_decode(text, start)
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict) or not isinstance(obj.get("shortlist"), list):
        return None
    seen: set[int] = set()
    out: list[int] = []
    for raw in obj["shortlist"]:
        try:
            idx = int(raw) - 1
        except (TypeError, ValueError):
            continue
        if 0 <= idx < pool_size and idx not in seen:
            seen.add(idx)
            out.append(idx)
        if len(out) >= keep_n:
            break
    return out


async def _triage_once(
    profile: dict[str, Any],
    pool_jobs: list[dict[str, Any]],
    provider: LLMProvider,
    keep_n: int,
) -> list[dict[str, Any]]:
    """ONE triage LLM call over a single (chunk-sized) pool → keep_n best-fit.

    Fails soft: on any provider/parse failure return the pool's deterministic-
    overlap order truncated to keep_n — the deep eval still runs, just on the
    overlap head instead of the brain-ranked head. Never breaks the compute.
    """
    messages = [
        {"role": "system", "content": build_triage_prompt(profile, profile.get("cv_markdown") or "")},
        {"role": "user", "content": build_triage_user(pool_jobs, keep_n)},
    ]
    try:
        content = await provider.complete(messages, max_tokens=_TRIAGE_MAX_TOKENS)
    except LLMProviderError:
        logger.error("triage: providers failed over pool=%d — falling back to overlap order", len(pool_jobs))
        return pool_jobs[:keep_n]
    indices = parse_triage(content, len(pool_jobs), keep_n)
    if indices is None:
        logger.warning("triage: unparseable — falling back to overlap order")
        return pool_jobs[:keep_n]
    # F2: an empty shortlist `[]` is a DELIBERATE "none of these fit" from a strong
    # model (never-pad) — honour it, never pad with overlap-head junk. Only genuinely
    # unparseable output (None) falls back to the overlap head.
    return [pool_jobs[i] for i in indices]


async def triage_shortlist(
    profile: dict[str, Any],
    pool_jobs: list[dict[str, Any]],
    provider: LLMProvider,
    keep_n: int,
) -> list[dict[str, Any]]:
    """Cheap batched pass: pool → the ``keep_n`` best-fit jobs, brain-ranked.

    A pool up to ``_TRIAGE_CHUNK`` is one LLM call. A larger pool is a tournament:
    chunks of ``_TRIAGE_CHUNK`` triage in parallel, each yields its best ``keep_n``,
    and the merged winners triage again until they fit one call. So the pool can be
    large (more role-relevant candidates reach the brain) while every prompt stays
    within context and triage stays sharp. Converges because ``keep_n`` <
    ``_TRIAGE_CHUNK``, so each round shrinks the field. Fails soft throughout.
    """
    if keep_n <= 0:
        return []
    if len(pool_jobs) <= keep_n:
        return pool_jobs
    if len(pool_jobs) <= _TRIAGE_CHUNK:
        return await _triage_once(profile, pool_jobs, provider, keep_n)

    chunks = [pool_jobs[i:i + _TRIAGE_CHUNK] for i in range(0, len(pool_jobs), _TRIAGE_CHUNK)]
    round_results = await asyncio.gather(
        *(_triage_once(profile, chunk, provider, keep_n) for chunk in chunks)
    )
    finalists = [job for chunk_result in round_results for job in chunk_result]
    # Winners collapse toward keep_n each round → recursion terminates.
    return await triage_shortlist(profile, finalists, provider, keep_n)


# ── Response parser ───────────────────────────────────────────────────────────

def _clamp(value: Any, lo: float, hi: float, default: float | None) -> float | None:
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return default


def parse_eval(text: str) -> dict[str, Any] | None:
    """Extract and validate one evaluation JSON object from the LLM response."""
    # Strip <think>…</think> emitted by reasoning-distilled models (no-op if absent).
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    if "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    if start == -1:
        return None
    try:
        obj, _ = json.JSONDecoder().raw_decode(text, start)
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict):
        return None

    rec = obj.get("recommendation")
    overall = _clamp(obj.get("overall_score"), 0.0, 5.0, None)
    # Enforce the Skip-below-3.5 rule even if the model forgot it.
    if overall is not None and overall < 3.5:
        rec = "Skip"
    if rec not in _RECOMMENDATIONS:
        rec = None
    band = _ctc_band(obj.get("ctc_lpa"))

    return {
        "overall_score": overall,
        "grade": (obj.get("grade") or None),
        "role_fit": _clamp(obj.get("role_fit"), 0.0, 5.0, None),
        "comp_fit": _clamp(obj.get("comp_fit"), 0.0, 5.0, None),
        "growth_fit": _clamp(obj.get("growth_fit"), 0.0, 5.0, None),
        "culture_fit": _clamp(obj.get("culture_fit"), 0.0, 5.0, None),
        "risk_score": _clamp(obj.get("risk_score"), 0.0, 5.0, None),
        "summary": (obj.get("summary") or None),
        "strengths": [str(s) for s in (obj.get("strengths") or [])][:5],
        "concerns": [str(c) for c in (obj.get("concerns") or [])][:5],
        "recommendation": rec,
        "application_angle": (obj.get("application_angle") or None),
        "archetype": (str(obj["archetype"]).strip()[:60] or None) if obj.get("archetype") else None,
        "legitimacy_tier": (
            obj["legitimacy_tier"]
            if obj.get("legitimacy_tier") in _LEGITIMACY_TIERS
            else None
        ),
        "legitimacy_reason": (str(obj["legitimacy_reason"]).strip()[:160] or None) if obj.get("legitimacy_reason") else None,
        # Career Ops strategy block (6-block extension): level fit, per-candidate
        # application tailoring, and the candidate's own STAR pointers to cite.
        "level_strategy": (str(obj["level_strategy"]).strip()[:400] or None) if obj.get("level_strategy") else None,
        "personalization": (str(obj["personalization"]).strip()[:1000] or None) if obj.get("personalization") else None,
        "star_pointers": [str(s).strip()[:160] for s in (obj.get("star_pointers") or []) if str(s).strip()][:4],
        "pick_reason": _reader_line(obj.get("pick_reason")),
        # Pay band and broken lines. `gate_verdict` turns the indices into the
        # person's words and enforces the Skip; the parse only validates shape.
        "ctc_low_lpa": band[0],
        "ctc_high_lpa": band[1],
        "ctc_basis": (
            obj.get("ctc_basis") if obj.get("ctc_basis") in _CTC_BASES and band[0] is not None
            else ("estimated" if band[0] is not None else None)
        ),
        "breaks": [
            int(i) for i in (obj.get("breaks") if isinstance(obj.get("breaks"), list) else [])
            if isinstance(i, (int, float)) and not isinstance(i, bool) and float(i).is_integer()
        ],
    }


def _reader_line(value: Any) -> str | None:
    """The one line the reader sees — or nothing.

    `reader_voice` is the project's single owner of how Myro addresses a reader,
    and its verdict is enforcement, not advice: a line that talks ABOUT the
    reader is dropped, not rewritten. Rewriting it here would put a second voice
    rule in the codebase, and the model regenerates the line on the next eval
    anyway. A dropped line leaves the card on `summary`, which is where it is
    today.
    """
    text = str(value or "").strip()
    if not text:
        return None
    text = text[:400]
    violations = reader_voice.violations(text)
    if violations:
        logger.info("metric llm_ranker.pick_reason_rejected reasons=%s", ",".join(violations))
        return None
    return text


# ── LLM call (per job) ─────────────────────────────────────────────────────────

async def evaluate_job(
    job: dict[str, Any],
    system_prompt: str,
    provider: LLMProvider,
) -> ModelOutcome:
    """Evaluate one job. Returns a Model Outcome, never a collapsed None."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": build_job_context(job)},
    ]
    try:
        content = await provider.complete(messages, max_tokens=_MAX_TOKENS)
    except LLMProviderError:
        logger.error("Job eval providers failed for job=%s", job.get("job_id"))
        return ModelOutcome.unavailable("provider")
    if not (content or "").strip():
        logger.warning("LLM ranker: empty eval for job=%s", job.get("job_id"))
        return ModelOutcome.malformed("empty")
    parsed = parse_eval(content)
    if parsed is None or parsed.get("overall_score") is None:
        logger.warning("LLM ranker: unparseable eval for job=%s", job.get("job_id"))
        return ModelOutcome.malformed("unparseable")
    return ModelOutcome.ok(parsed)


RankProgressCb = Callable[[int, int, dict[str, Any]], None]


async def evaluate_all(
    profile: dict[str, Any],
    top_jobs: list[dict[str, Any]],
    provider: LLMProvider,
    on_progress: RankProgressCb | None = None,
) -> dict[str, dict[str, Any]]:
    """Evaluate every shortlisted job. Returns {job_id: eval}. Failed jobs omitted.

    `on_progress(done, total, job)` fires once per job as its eval lands (in
    completion order) — powers the ADR-0009 per-job refresh reveal. Best-effort:
    a raising callback never breaks ranking.
    """
    system_prompt = build_system_prompt(profile, profile.get("cv_markdown") or "")
    sem = asyncio.Semaphore(_CONCURRENCY)
    total = len(top_jobs)
    done = 0

    async def _one(job: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
        nonlocal done
        async with sem:
            outcome = await evaluate_job(job, system_prompt, provider)
        done += 1  # single-threaded event loop → increment is atomic
        if on_progress is not None:
            try:
                on_progress(done, total, job)
            except Exception:
                logger.warning("rank on_progress callback failed", exc_info=True)
        ev = outcome.value if outcome.kind == "ok" else None
        if isinstance(ev, dict):
            gate_verdict(profile, ev)
        return str(job["job_id"]), ev

    results = await asyncio.gather(*(_one(j) for j in top_jobs))
    return {jid: ev for jid, ev in results if ev is not None}


# ── Persist ───────────────────────────────────────────────────────────────────

def persist_matches(
    db: Client,
    user_id: str,
    batch_week: date,
    top_jobs: list[dict],
    evaluations: dict[str, dict],
    profile: dict[str, Any] | None = None,
    pinned_ranks: dict[str, int] | None = None,
) -> int:
    """Upsert the user's Job Matches to user_job_matches. Returns count written.

    Backlog #36 (de-weekly): one permanent row per (user, job) — a re-eval
    upserts in place. `batch_week` still rides in each row for provenance, but is
    NOT part of the identity (migration 20260710).

    `evaluations` maps job_id → parse_eval() output. Jobs without an evaluation
    fall back to overlap-score-only rows (verdict fields null) — which is exactly
    a Provisional Match: real overlap, no verdict yet, `verdict == "checking"` at
    the read seam.

    `pinned_ranks` holds a job at the position it was already SHOWN at. The
    brain's ranking is the better one, but a user reading a shortlist should not
    have it reorder underneath them mid-read; the provisional pass writes the
    order, the brain pass corrects the numbers in place. Jobs outside the map rank
    normally, below the pinned ones.

    llm_rank is derived from overall_score (eval'd jobs first), and
    llm_explanation mirrors `summary` for back-compat with older readers.
    """
    now = datetime.now(timezone.utc).isoformat()

    # Defensive dedupe by job_id, keeping the highest overlap_score seen.
    jobs_by_id: dict[str, dict] = {}
    for job in top_jobs:
        jid = str(job["job_id"])
        prev = jobs_by_id.get(jid)
        if prev is None or (job.get("overlap_score") or 0) > (prev.get("overlap_score") or 0):
            jobs_by_id[jid] = job

    # Rank order: pinned jobs first, in the order they were already shown; then
    # eval'd jobs by overall_score desc; then the rest by overlap_score.
    pinned = pinned_ranks or {}
    ordered = sorted(
        jobs_by_id.values(),
        key=lambda j: (
            # Negated so the ascending `sort` puts pin 1 ahead of pin 2 while the
            # whole tuple still sorts descending.
            -pinned.get(str(j["job_id"]), len(pinned) + 1),
            evaluations.get(str(j["job_id"]), {}).get("overall_score") or -1.0,
            j.get("overlap_score") or 0.0,
        ),
        reverse=True,
    )

    from app.services.match_credibility import evaluate_credibility

    from app.services.onboarding_service import eval_context_key

    profile = profile or {}
    baseline_version_id = profile.get("baseline_version_id")
    # What the brain was told for THIS run — identical for every row it writes, so
    # compute once. The skip gates compare it to decide whether a cached verdict is
    # still the answer or was reasoned from a targeting context we have since moved
    # past. See onboarding_service.eval_context_key for why it is a second key and
    # not a widened target_context_hash.
    eval_ctx = eval_context_key(profile)
    rows: list[dict] = []
    # Recommended slots are counted PER TRACK. A user running two searches whose
    # three slots all landed in one of them would open the other on nothing
    # recommended and read it as "Myro found me nothing here". Single-track users
    # have one bucket keyed None, which is exactly the old global counter.
    recommended_by_track: dict[int | None, int] = {}
    for rank_idx, job in enumerate(ordered, start=1):
        jid = str(job["job_id"])
        ev = evaluations.get(jid) or {}
        overall = ev.get("overall_score")
        recommendation = ev.get("recommendation")
        credibility = evaluate_credibility(profile, job, overall, recommendation)
        track_id = job.get("track_id")
        is_recommended = credibility.credible and recommended_by_track.get(track_id, 0) < 3
        if is_recommended:
            recommended_by_track[track_id] = recommended_by_track.get(track_id, 0) + 1
        row = {
            "user_id": user_id,
            "job_id": jid,
            # Which of the user's searches found this. NULL = track 1 = the
            # profile, which is every row for the 83% who have one search.
            "track_id": track_id,
            "batch_week": str(batch_week),
            "overlap_score": job["overlap_score"],
            "matched_skills": job.get("matched_skills") or [],
            "missing_skills": job.get("missing_skills") or [],
            "llm_rank": rank_idx,
            "llm_explanation": ev.get("summary"),
            "overall_score": overall,
            "grade": ev.get("grade"),
            "recommendation": credibility.recommendation,
            "application_angle": ev.get("application_angle"),
            "summary": ev.get("summary"),
            "role_fit": ev.get("role_fit"),
            "comp_fit": ev.get("comp_fit"),
            "growth_fit": ev.get("growth_fit"),
            "culture_fit": ev.get("culture_fit"),
            "risk_score": ev.get("risk_score"),
            "strengths": ev.get("strengths") or [],
            "concerns": ev.get("concerns") or [],
            "archetype": ev.get("archetype"),
            "legitimacy_tier": ev.get("legitimacy_tier"),
            "legitimacy_reason": ev.get("legitimacy_reason"),
            "level_strategy": ev.get("level_strategy"),
            "personalization": ev.get("personalization"),
            "pick_reason": ev.get("pick_reason"),
            "star_pointers": ev.get("star_pointers") or [],
            "ctc_low_lpa": ev.get("ctc_low_lpa"),
            "ctc_high_lpa": ev.get("ctc_high_lpa"),
            "ctc_basis": ev.get("ctc_basis"),
            "breaks": ev.get("breaks") or [],
            "is_recommended": is_recommended,
            "baseline_version_id": baseline_version_id,
            "target_context_hash": credibility.context_hash,
            "eval_context_hash": eval_ctx,
            "seniority_compatibility": credibility.seniority_compatibility,
            "computed_at": now,
        }
        # Omit eval_outcome on a Provisional Match write so an upsert cannot
        # erase a stored permanent Model Outcome (malformed / invalid_input).
        if overall is not None:
            row["eval_outcome"] = "ok"
        rows.append(row)

    if rows:
        # Permanent per-(user,job) identity (Backlog #36 de-weekly; migration
        # 20260710) — re-evaluating a job upserts the same row instead of
        # stacking a duplicate per week.
        db.table("user_job_matches").upsert(
            rows, on_conflict="user_id,job_id"
        ).execute()

    return len(rows)


# ── Main entry point ──────────────────────────────────────────────────────────

async def rank_and_persist(
    db: Client,
    user_id: str,
    batch_week: date,
    profile: dict[str, Any],
    top_jobs: list[dict],
    provider: LLMProvider,
    on_progress: RankProgressCb | None = None,
) -> int:
    """Full Stage-2 pipeline: per-job 5-axis eval → persist. Returns rows written."""
    if not top_jobs:
        return 0

    evaluations = await evaluate_all(profile, top_jobs, provider, on_progress)
    if not evaluations:
        logger.warning(
            "Matching Brain: all evals failed for user %s — storing overlap scores only",
            user_id,
        )
    return persist_matches(db, user_id, batch_week, top_jobs, evaluations, profile)
