"""The ₹599 pack's filing step (ENG5): the role, the cities and the career pages
Myro files on, with consent. The pack's grant (settlement) marks it paid."""

from __future__ import annotations

from app.database import get_supabase_admin
from app.repositories.filing_intake import FilingIntakeRepository

FILING_INTAKE_PRICE_PAISE = 59900


def mark_paid(user_id: str) -> None:
    FilingIntakeRepository(get_supabase_admin(), get_supabase_admin()).mark_paid(user_id)
