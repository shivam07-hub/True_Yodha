"""Response models for the gap-alert signal (Signal Thread S3).

Dedicated module (not schemas/jobs.py) so the intel surfaces own their contract.
"""

from __future__ import annotations

from pydantic import BaseModel


class CompanyGapSignalItem(BaseModel):
    company_name: str
    skill: str
    # Roles first seen in the last 7 days at this company requiring this skill.
    new_roles: int


class CompanyGapSignalsResponse(BaseModel):
    # Only cells with new_roles > 0, sorted most new roles first. Empty when no
    # followed company posted a matching role this week (the strip hides).
    signals: list[CompanyGapSignalItem]
