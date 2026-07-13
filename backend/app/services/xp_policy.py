"""Shared XP economy constants.

Keep spend/earn amounts here so routers and tests do not drift from the
user-facing XP explanations.
"""

WELCOME_XP = 3000
DIARY_ENTRY_XP = 30
LINKEDIN_PROFILE_XP = 50

# Behavioural reward — granted once per job added to the tracker (any source:
# manual, pasted JD, or parsed file/image). Extraction itself stays free.
ADD_JOB_REWARD_XP = 20

SKILL_ADVICE_XP_COST = 20

# Per-bullet Mentor rewrite (DESIGN_cv_playground_redesign §6). v1 ships FREE —
# the CV-fix wedge is effectively free per ADR-0004 (floor-0 + welcome grant).
# Final pricing is DEC-H (pending Shivam); wire charge_or_raise here when set.
REWRITE_BULLET_XP_COST = 0

# Whole-CV "Restructure with Mentor" (DESIGN_cv_playground_redesign §6.2, CVJT1).
# Proposing is FREE; the charge fires ONLY when the user KEEPS the proposal, so
# failed / rejected / discarded proposals cost nothing. Floor 0 (premium action —
# the user must hold the full cost; no debt).
RESTRUCTURE_CV_XP_COST = 20
RESTRUCTURE_CV_XP_FLOOR = 0

FOLLOW_COMPANY_XP_COST = 10
FOLLOW_COMPANY_XP_FLOOR = -30
FOLLOWED_COMPANY_LIMIT = 10

# Per-job Reach Pack (backlog #35, ADR-0018): the automated full reach plan —
# outreach drafted in the user's voice from their CV + referral-ask + timing +
# any warm intros. The free tier (which roles to search, search URLs) charges
# nothing; this is the LLM-bearing pack. Floor 0 (premium action; charged on
# success only, idempotent replay is free). The one-click extension search and
# the in-drawer search list stay free.
REACH_PACK_XP_COST = 50
REACH_PACK_XP_FLOOR = 0

# Standardized matcher: every match run costs the same flat price — no free tier, no
# vanity surcharge (reverses the old "free when new jobs / 150 for vanity" waiver,
# #36 N2). A run is the strong-judgment triage + 6-block eval over the overlap ∪
# title_filter pool; the user pays 100 to ask Myro to match. See CONTEXT.md "Match Run".
MATCH_RUN_COST = 100

# ADR-0004 — LLM-bearing actions cost XP. Floor 0 for core flows.
CV_UPLOAD_XP_COST = 200
CV_UPLOAD_XP_FLOOR = 0

# Upskilling ladder (PRD §4.3). Strictly performance-based: tokens are earned
# ONLY on a clear, and ONLY the first clear of each (skill, level). Below the
# pass bar earns nothing — no participation floor. Score → award tier:
#   10/10 → +50 (Perfect)   9/10 → +30 (Pass)   8/10 → +20 (Pass)   ≤7/10 → 0.
# The first-clear idempotency rides the existing reward_xp RPC keyed by
# (action='upskilling_clear', ref_table='quiz_attempts', ref_id=attempt_id).
UPSKILLING_SET_SIZE = 10
UPSKILLING_PASS_BAR = 8
UPSKILLING_CLEAR_TIERS = {10: 50, 9: 30, 8: 20}  # score → tokens (first clear only)


def upskilling_award_for(score: int) -> int:
    """Tokens for a set score — first clear only; below the bar earns 0."""
    return UPSKILLING_CLEAR_TIERS.get(score, 0) if score >= UPSKILLING_PASS_BAR else 0
