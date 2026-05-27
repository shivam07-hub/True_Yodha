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

FOLLOW_COMPANY_XP_COST = 10
FOLLOW_COMPANY_XP_FLOOR = -30
FOLLOWED_COMPANY_LIMIT = 10

MATCH_REFRESH_XP_COST = 50

# ADR-0004 — LLM-bearing actions cost XP. Floor 0 for core flows.
CV_UPLOAD_XP_COST = 200
CV_UPLOAD_XP_FLOOR = 0
