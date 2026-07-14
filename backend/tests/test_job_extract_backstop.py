"""Server-side extraction backstop: validation + fill order (client → JSON-LD → LLM)."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import job_extract_backstop as bs


# ── validation ───────────────────────────────────────────────────────────────

def test_is_valid_company_rejects_junk() -> None:
    assert not bs.is_valid_company("Job ID: 10426211")
    assert not bs.is_valid_company("10426211")
    assert not bs.is_valid_company("https://amazon.jobs/x")
    assert not bs.is_valid_company("Careers")
    assert not bs.is_valid_company("")
    assert bs.is_valid_company("Amazon")
    assert bs.is_valid_company("Capgemini GCC Growth")


def test_is_valid_company_rejects_team_names() -> None:
    # Live 2026-07-14: Deloitte LinkedIn import stored company "Sales Strategy"
    # (the JD's "USI Sales Strategy and Transformation team"). Pure function-noun
    # phrases are team names, not employers.
    assert not bs.is_valid_company("Sales Strategy")
    assert not bs.is_valid_company("Sales Strategy and Transformation")
    assert not bs.is_valid_company("Digital Transformation Team")
    assert not bs.is_valid_company("Customer Strategy & Design")
    # Real employers keep a proper noun and must survive.
    assert bs.is_valid_company("Deloitte")
    assert bs.is_valid_company("Accenture Strategy")
    assert bs.is_valid_company("Sun Pharmaceutical Industries Ltd")
    assert bs.is_valid_company("Monitor Deloitte")


def test_is_valid_role_and_location() -> None:
    assert bs.is_valid_role("Account Manager I")
    assert not bs.is_valid_role("Job ID: 5")
    assert bs.is_valid_location("Gurgaon, IN")
    assert not bs.is_valid_location("https://x.com")


# ── backfill order ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_backfill_keeps_valid_client_values_without_llm(monkeypatch: Any) -> None:
    called = False

    async def _boom(*a: Any, **k: Any) -> dict:
        nonlocal called
        called = True
        return {}

    monkeypatch.setattr(bs, "extract_job_from_text", _boom)

    out = await bs.backfill_fields(
        role_name="Account Manager", company_name="Amazon", location="Gurgaon",
        job_description="x" * 200, json_ld=None, needs_backstop=False,
    )
    assert out == {"role_name": "Account Manager", "company_name": "Amazon", "location": "Gurgaon"}
    assert called is False  # all fields valid → no LLM


@pytest.mark.asyncio
async def test_backfill_drops_junk_company_and_fills_from_json_ld(monkeypatch: Any) -> None:
    async def _no_llm(*a: Any, **k: Any) -> dict:
        return {}

    monkeypatch.setattr(bs, "extract_job_from_text", _no_llm)

    out = await bs.backfill_fields(
        role_name="Account Manager",
        company_name="Job ID: 10426211",          # junk → dropped
        location=None,
        job_description="short",                    # < 80 → no LLM
        json_ld={"companyName": "Amazon", "location": "Gurgaon, IN"},
        needs_backstop=True,
    )
    assert out["company_name"] == "Amazon"          # from JSON-LD
    assert out["location"] == "Gurgaon, IN"


@pytest.mark.asyncio
async def test_backfill_uses_llm_when_still_missing(monkeypatch: Any) -> None:
    async def _llm(text: str, provider: Any) -> dict:
        return {"company": "Stripe", "role": "Engineer", "location": "Remote"}

    monkeypatch.setattr(bs, "extract_job_from_text", _llm)
    monkeypatch.setattr(bs, "get_llm_provider", lambda: object())

    out = await bs.backfill_fields(
        role_name=None, company_name=None, location=None,
        job_description="A long enough job description to trigger the LLM backstop path." * 3,
        json_ld=None, needs_backstop=True,
    )
    assert out == {"role_name": "Engineer", "company_name": "Stripe", "location": "Remote"}


@pytest.mark.asyncio
async def test_backfill_replaces_team_name_company_via_llm(monkeypatch: Any) -> None:
    # The Deloitte case end-to-end: client scraped the team name → invalid →
    # hardened LLM prompt returns the employer.
    async def _llm(text: str, provider: Any) -> dict:
        return {"company": "Deloitte", "role": "", "location": "Bengaluru"}

    monkeypatch.setattr(bs, "extract_job_from_text", _llm)
    monkeypatch.setattr(bs, "get_llm_provider", lambda: object())

    out = await bs.backfill_fields(
        role_name="Manager, Strategy, Growth, and Transformation",
        company_name="Sales Strategy",              # team name → dropped
        location=None,
        job_description="The USI Sales Strategy and Transformation team within CS&D…" + "x" * 100,
        json_ld=None, needs_backstop=False,
    )
    assert out["company_name"] == "Deloitte"


@pytest.mark.asyncio
async def test_backfill_failsoft_when_llm_errors(monkeypatch: Any) -> None:
    from app.services.job_file_parser import JobFileParseError

    async def _err(*a: Any, **k: Any) -> dict:
        raise JobFileParseError("busy")

    monkeypatch.setattr(bs, "extract_job_from_text", _err)
    monkeypatch.setattr(bs, "get_llm_provider", lambda: object())

    out = await bs.backfill_fields(
        role_name="Account Manager", company_name=None, location=None,
        job_description="x" * 200, json_ld=None, needs_backstop=True,
    )
    # LLM failed → keep what we had, no crash.
    assert out["role_name"] == "Account Manager"
    assert out["company_name"] is None
