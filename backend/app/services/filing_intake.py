"""₹599 once, for the personal resume and filing process. Not the Apply Pack."""

from __future__ import annotations

from app.database import get_supabase_admin
from app.repositories.filing_intake import FilingIntakeRepository

FILING_INTAKE_PRICE_PAISE = 59900


def mark_paid(user_id: str) -> None:
    FilingIntakeRepository(get_supabase_admin(), get_supabase_admin()).mark_paid(user_id)
