"""Assemble the one career-skill-path read model."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

from supabase import Client

from app.repositories.learning_path_requests import LearningPathRequests
from app.repositories.skill_certificates import SkillCertificates
from app.services.career_skill_path_cards import (
    build_band,
    next_action,
    qualified_demand,
)
from app.services.career_target import current_snapshot
from app.services.concurrent_reads import run_concurrently
from app.services.job_eligibility import adjacent_source_bands
from app.services.xp_policy import UPSKILLING_SET_SIZE


def assemble(db: Client, user_id: str) -> dict[str, Any]:
    snapshot = current_snapshot(db, user_id)
    if not snapshot:
        return {
            "needs_target": True,
            "snapshot": None,
            "lower": None,
            "anchor": None,
            "higher": None,
            "next_action": next_action([], needs_target=True),
            "target_flow": _target_flow(db, user_id),
        }
    family = str(snapshot.get("l2_role_family") or "")
    anchor_band = str(snapshot.get("seniority") or "")
    lower_band, higher_band = adjacent_source_bands(anchor_band)

    profile = run_concurrently(
        {
            "requests": lambda: LearningPathRequests(db).active_by_key(user_id),
            "certs": lambda: SkillCertificates(db).for_user(user_id),
            "label": lambda: _family_label(db, family, snapshot.get("role_title")),
        },
        label="career.skill_path.profile",
    )
    requests = profile["requests"]
    certs = _certs_by_key(profile["certs"])

    snapshot_out = {
        "id": str(snapshot["id"]),
        "role_title": snapshot.get("role_title"),
        "career_area": snapshot.get("l1_career_area") or None,
        "role_family": family,
        "role_family_label": profile["label"],
        "seniority": anchor_band,
        "locations": list(snapshot.get("locations") or []),
        "cv_baseline_id": snapshot.get("cv_baseline_id"),
        "created_at": snapshot.get("created_at"),
    }
    bands = [
        (kind, band)
        for kind, band in (("anchor", anchor_band), ("lower", lower_band), ("higher", higher_band))
        if family and band
    ]
    maps = _band_maps(db, user_id, family, bands, requests, certs)

    anchor_cards = (maps.get("anchor") or {}).get("cards") or []
    _fulfill_ready(db, user_id, requests, anchor_cards)
    return {
        "needs_target": False,
        "snapshot": snapshot_out,
        "lower": maps.get("lower"),
        "anchor": maps.get("anchor"),
        "higher": maps.get("higher"),
        "next_action": next_action(anchor_cards, needs_target=False),
        "target_flow": None,
    }


def _band_maps(
    db: Client,
    user_id: str,
    family: str,
    bands: list[tuple[str, str]],
    requests: dict[str, dict[str, Any]],
    certs: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Every band's map on a fixed read budget, whatever the band count.

    This used to be one `_band_map` per band, five SEQUENTIAL reads inside each:
    fifteen round trips for three bands, and the same skill fetched up to three
    times because adjacent bands share most of their demand. Measured at
    p50 5,882ms / max 7,895ms in the saturation alerts within a day of shipping.

    The bands differ only by seniority, so the reads collapse: one concurrent
    market wave, ONE `skills` lookup over the union of every band's demand, then
    one concurrent wave of the three user-state reads over that shared id set.
    Six round trips, max width three — the read contract
    (ARCHITECTURE_READ_PATH.md §2), not an exception to it.
    """
    if not bands:
        return {}
    markets = run_concurrently(
        {kind: _market_reader(db, family, band) for kind, band in bands},
        label="career.skill_path.market",
    )
    band_counts = {
        kind: int(rows[0]["band_job_count"]) if rows else 0 for kind, rows in markets.items()
    }
    keys = sorted({
        str(row["taxonomy_key"])
        for kind, rows in markets.items()
        for row in qualified_demand(rows, band_counts[kind])
        if row.get("taxonomy_key")
    })
    skills = _skills_by_key(db, keys)
    skill_ids = sorted({int(s["id"]) for s in skills.values() if s.get("id")})
    state = run_concurrently(
        {
            "user_rows": lambda: _user_skills(db, user_id, skill_ids),
            "assessed": lambda: _assessed(db, user_id, skill_ids),
            "ladders": lambda: _ladder_complete(db, skill_ids),
        },
        label="career.skill_path.skills",
    )
    return {
        kind: build_band(
            kind=kind,
            seniority=band,
            market=markets[kind],
            skills=skills,
            user_rows=state["user_rows"],
            assessed=state["assessed"],
            ladders=state["ladders"],
            requests=requests,
            certs=certs,
        )
        for kind, band in bands
    }


def _market_reader(db: Client, family: str, band: str) -> Callable[[], list[dict[str, Any]]]:
    # Bound as arguments, not closed over the loop variable: a late-binding
    # lambda would read the same band three times and look like a cache hit.
    def read() -> list[dict[str, Any]]:
        return (
            db.rpc(
                "role_family_band_market_skills",
                {"p_families": [family], "p_seniority": band},
            ).execute().data
            or []
        )

    return read


def _target_flow(db: Client, user_id: str) -> dict[str, Any] | None:
    from app.repositories.cv import CVVersionsRepository
    from app.repositories.users import UsersRepository
    from app.services import onboarding_service

    # Both reads are independent inputs to the payload, and both were waited on
    # in turn at ~310ms each on the /market gate path.
    reads = run_concurrently(
        {
            "baseline": lambda: CVVersionsRepository(db).latest_baseline(user_id),
            "profile": lambda: UsersRepository(db).get_profile(user_id),
        },
        label="career.target_flow",
    )
    baseline = reads["baseline"]
    if not baseline:
        return None
    return onboarding_service._awaiting_target_payload(
        db, user_id, reads["profile"] or {}, baseline
    )

def _family_label(db: Client, family: str, fallback: str | None) -> str | None:
    if not family:
        return fallback
    rows = (
        db.table("role_family_labels").select("label").eq("family", family).limit(1).execute()
    ).data or []
    if rows and rows[0].get("label"):
        return str(rows[0]["label"])
    return fallback

def _certs_by_key(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = str(row.get("taxonomy_key") or "")
        if key and key not in out:
            out[key] = row
    return out


def _skills_by_key(db: Client, keys: list[str]) -> dict[str, dict[str, Any]]:
    if not keys:
        return {}
    rows = (
        db.table("skills")
        .select("id, taxonomy_key, display_name")
        .in_("taxonomy_key", keys)
        .execute()
    ).data or []
    return {str(row["taxonomy_key"]): row for row in rows}


def _user_skills(db: Client, user_id: str, skill_ids: list[int]) -> dict[int, dict[str, Any]]:
    if not skill_ids:
        return {}
    rows = (
        db.table("user_skills")
        .select("skill_id, matched_level, evidence_text")
        .eq("user_id", user_id)
        .in_("skill_id", skill_ids)
        .execute()
    ).data or []
    return {int(row["skill_id"]): row for row in rows if row.get("skill_id") is not None}


def _assessed(db: Client, user_id: str, skill_ids: list[int]) -> dict[int, int]:
    if not skill_ids:
        return {}
    rows = (
        db.table("skill_assessed_level")
        .select("skill_id, assessed_level")
        .eq("user_id", user_id)
        .in_("skill_id", skill_ids)
        .execute()
    ).data or []
    return {int(row["skill_id"]): int(row.get("assessed_level") or 0) for row in rows}


def _ladder_complete(db: Client, skill_ids: list[int]) -> dict[int, bool]:
    if not skill_ids:
        return {}
    rows = (
        db.table("skill_questions")
        .select("skill_id, level")
        .eq("status", "active")
        .in_("skill_id", skill_ids)
        .execute()
    ).data or []
    counts: dict[int, dict[int, int]] = {}
    for row in rows:
        sid = int(row["skill_id"])
        lvl = int(row["level"])
        counts.setdefault(sid, {})[lvl] = counts.setdefault(sid, {}).get(lvl, 0) + 1
    return {
        sid: all(counts.get(sid, {}).get(level, 0) >= UPSKILLING_SET_SIZE for level in range(1, 6))
        for sid in skill_ids
    }


def _fulfill_ready(
    db: Client,
    user_id: str,
    requests: dict[str, dict[str, Any]],
    cards: list[dict[str, Any]],
) -> None:
    from app.repositories.notifications import NotificationsRepository

    complete = {card["taxonomy_key"] for card in cards if card.get("ladder_complete")}
    inbox = NotificationsRepository(db)
    repo = LearningPathRequests(db)
    for key, row in requests.items():
        if row.get("fulfilled_at") or key not in complete:
            continue
        name = next((c["display_name"] for c in cards if c["taxonomy_key"] == key), key)
        inbox.record_learning_path_ready(user_id, taxonomy_key=key, skill_name=name)
        repo.mark_fulfilled(str(row["id"]), None)
        row["fulfilled_at"] = "now"
        for card in cards:
            if card["taxonomy_key"] == key:
                card["request_status"] = "fulfilled"
