"""Human Check (ARCHITECTURE_PAYMENTS.md §6 S2, §10.1, ENG3, ENG5): transitions,
capacity across both kinds, the honest ETA, delivery rules per kind, the
5,000-coin LinkedIn path, and the call every check ends in — the number it is
booked on, and closing it clearing that number."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

from app.services import human_check as hc
from app.services import linkedin_draft


class InMemoryChecks:
    def __init__(self) -> None:
        self.rows: dict[str, dict[str, Any]] = {}

    def by_id(self, check_id: str) -> dict[str, Any] | None:
        row = self.rows.get(check_id)
        return dict(row) if row else None

    def by_payment(self, billing_payment_id: str) -> dict[str, Any] | None:
        for row in self.rows.values():
            if row.get("billing_payment_id") == billing_payment_id:
                return dict(row)
        return None

    def by_pack(self, pack_payment_id: str, pack_slot: int) -> dict[str, Any] | None:
        for row in self.rows.values():
            if row.get("pack_payment_id") == pack_payment_id and row.get("pack_slot") == pack_slot:
                return dict(row)
        return None

    def for_payment(self, payment_id: str) -> list[dict[str, Any]]:
        return [
            dict(r)
            for r in self.rows.values()
            if payment_id in (r.get("billing_payment_id"), r.get("pack_payment_id"))
        ]

    def insert(self, row: dict[str, Any]) -> dict[str, Any] | None:
        if row.get("billing_payment_id") and self.by_payment(row["billing_payment_id"]):
            return None
        if row.get("pack_payment_id") and self.by_pack(row["pack_payment_id"], row["pack_slot"]):
            return None
        new = {"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat(), **row}
        self.rows[new["id"]] = new
        return dict(new)

    def update_if(self, check_id: str, expect_status: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        row = self.rows.get(check_id)
        if not row or row["status"] != expect_status:
            return None
        row.update(patch)
        return dict(row)

    def delete(self, check_id: str) -> None:
        self.rows.pop(check_id, None)

    def open_due_ats(self) -> list[datetime]:
        return [
            datetime.fromisoformat(r["due_at"]) for r in self.rows.values() if r["status"] in ("queued", "in_review")
        ]

    def for_user(self, user_id: str) -> list[dict[str, Any]]:
        return [dict(r) for r in self.rows.values() if r["user_id"] == user_id]

    def open_queue(self) -> list[dict[str, Any]]:
        return sorted(
            (dict(r) for r in self.rows.values() if r["status"] in ("queued", "in_review")), key=lambda r: r["due_at"]
        )

    def calls_to_close(self) -> list[dict[str, Any]]:
        return [
            dict(r)
            for r in self.rows.values()
            if r["status"] == "delivered" and not r.get("call_closed_at")
        ]


@pytest.fixture(autouse=True)
def _quiet_notifications(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(hc, "notify_reviewer", lambda row: sent.append(("reviewer", row["id"])))
    monkeypatch.setattr(hc, "notify_user", lambda row: sent.append(("user", row["id"])))
    return sent


URL = "https://www.linkedin.com/in/someone-real/"
BLOCKS = {
    "headline": "Data & AI GTM for Europe GCCs in India",
    "about": "I sell Data & AI into Europe's GCCs in India.",
    "experience": [{"company": "Acme", "title": "Manager", "dates": "2024 – now", "text": "Ran the motion."}],
    "education": ["MBA · IIM Lucknow"],
    "skills": ["GTM"],
    "featured": "The deck.",
    "delete": ["Duplicate Acme role"],
}


def _queued_linkedin(store: InMemoryChecks, user: str = "u1") -> dict[str, Any]:
    check = hc.open_check(store, user, billing_payment_id=f"pay-{uuid.uuid4()}", job_id=None)
    return hc.assign_linkedin(store, user, check["id"], linkedin_url=URL, whatsapp="98765 43210")


# ── opening and using a check ───────────────────────────────────────────────


def test_a_pack_without_a_job_holds_an_unassigned_check(_quiet_notifications: list) -> None:
    store = InMemoryChecks()
    check = hc.open_check(store, "u1", billing_payment_id="pay-1", job_id=None)

    assert check["status"] == "unassigned"
    assert check["kind"] is None if "kind" in check else True
    assert check.get("due_at") is None
    assert _quiet_notifications == []  # nothing to review yet


def test_a_pack_bought_for_a_job_queues_a_cv_check_with_a_24h_clock(_quiet_notifications: list) -> None:
    store = InMemoryChecks()
    check = hc.open_check(store, "u1", billing_payment_id="pay-1", job_id="job-9")

    assert (check["status"], check["kind"], check["job_id"]) == ("queued", "cv_job", "job-9")
    due = datetime.fromisoformat(check["due_at"]) - datetime.fromisoformat(check["slot_starts_at"])
    assert due == timedelta(hours=24)
    assert _quiet_notifications == [("reviewer", check["id"])]


def test_open_is_idempotent_on_the_payment() -> None:
    store = InMemoryChecks()
    first = hc.open_check(store, "u1", billing_payment_id="pay-1", job_id=None)
    again = hc.open_check(store, "u1", billing_payment_id="pay-1", job_id="job-9")

    assert again["id"] == first["id"]
    assert len(store.rows) == 1


def test_a_held_check_spent_on_linkedin_queues_with_the_url_and_a_normalised_number() -> None:
    store = InMemoryChecks()
    check = _queued_linkedin(store)

    assert (check["status"], check["kind"]) == ("queued", "linkedin")
    assert check["linkedin_url"].startswith("https://www.linkedin.com/in/someone-real")
    assert check["contact_whatsapp"] == "+919876543210"


def test_a_search_url_is_not_a_profile() -> None:
    store = InMemoryChecks()
    check = hc.open_check(store, "u1", billing_payment_id="pay-1", job_id=None)
    with pytest.raises(hc.CheckInputInvalid):
        hc.assign_linkedin(
            store, "u1", check["id"], linkedin_url="https://www.linkedin.com/search/results/people/?q=x", whatsapp="9876543210"
        )
    assert store.by_id(check["id"])["status"] == "unassigned"


@pytest.mark.parametrize("raw", ["12345", "call me", "+12"])
def test_a_number_we_cannot_reach_is_refused(raw: str) -> None:
    with pytest.raises(hc.CheckInputInvalid):
        hc.normalize_whatsapp(raw)


def test_a_check_cannot_be_spent_twice() -> None:
    store = InMemoryChecks()
    check = hc.open_check(store, "u1", billing_payment_id="pay-1", job_id=None)
    hc.assign_job(store, "u1", check["id"], "job-1")
    with pytest.raises(hc.CheckConflict):
        hc.assign_linkedin(store, "u1", check["id"], linkedin_url=URL, whatsapp="9876543210")


def test_someone_elses_check_is_not_found() -> None:
    store = InMemoryChecks()
    check = hc.open_check(store, "u1", billing_payment_id="pay-1", job_id=None)
    with pytest.raises(hc.CheckNotFound):
        hc.assign_job(store, "u2", check["id"], "job-1")


# ── capacity and the honest ETA ─────────────────────────────────────────────


def test_capacity_is_shared_across_both_kinds_and_the_sixth_waits_for_a_slot() -> None:
    store = InMemoryChecks()
    for i in range(3):
        hc.open_check(store, f"u{i}", billing_payment_id=f"pay-cv-{i}", job_id=f"job-{i}")
    _queued_linkedin(store, user="l0")
    assert hc.availability(store).checks_full is False  # four open, one slot left
    assert hc.availability(store).slots_open == 1

    _queued_linkedin(store, user="l1")
    assert hc.availability(store).checks_full is True  # five open, both kinds count
    assert hc.availability(store).slots_open == 0

    earliest_due = min(store.open_due_ats())
    sixth = hc.open_check(store, "u6", billing_payment_id="pay-6", job_id="job-6")

    assert datetime.fromisoformat(sixth["slot_starts_at"]) == earliest_due
    assert datetime.fromisoformat(sixth["due_at"]) == earliest_due + timedelta(hours=24)
    offer = hc.availability(store)
    assert offer.checks_full is True
    assert offer.slots_open == 0  # six open never reads as a negative slot
    assert offer.ready_by > earliest_due + timedelta(hours=24) - timedelta(seconds=1)


def test_ready_by_is_24_hours_out_while_a_slot_is_free() -> None:
    now = datetime(2026, 11, 22, 9, 0, tzinfo=timezone.utc)
    assert hc.slot_start([], now) == now
    offer = hc.availability(InMemoryChecks(), now)
    assert offer.checks_full is False
    assert offer.slots_open == hc.MAX_OPEN_CHECKS
    assert offer.ready_by - now == timedelta(hours=24)


def test_a_late_check_still_holds_its_slot() -> None:
    """Five open checks all past due: the clock starts now (the next slot is
    already owed), but the five are still on the reviewer's desk, so the public
    count says none is open (spec #66 Q16: "full" only when all five hold one)."""

    class _Late:
        def open_due_ats(self) -> list[datetime]:
            return [now - timedelta(hours=h) for h in range(1, 6)]

    now = datetime(2026, 11, 22, 9, 0, tzinfo=timezone.utc)
    offer = hc.availability(_Late(), now)  # type: ignore[arg-type]
    assert offer.slots_open == 0
    assert offer.ready_by == now + timedelta(hours=24)


# ── reviewer transitions ────────────────────────────────────────────────────


def test_cv_check_delivery_needs_a_note_and_the_reviewed_version(_quiet_notifications: list) -> None:
    store = InMemoryChecks()
    check = hc.open_check(store, "u1", billing_payment_id="pay-1", job_id="job-9")
    hc.claim(store, check["id"], "Shivam")

    with pytest.raises(hc.CheckInputInvalid):
        hc.deliver(store, check["id"], note="", reviewer_name="Shivam", reviewed_cv_version_id=7)
    with pytest.raises(hc.CheckInputInvalid):
        hc.deliver(store, check["id"], note="Tightened the top role.", reviewer_name="Shivam")

    done = hc.deliver(store, check["id"], note="Tightened the top role.", reviewer_name="Shivam", reviewed_cv_version_id=7)
    assert (done["status"], done["reviewer_name"], done["reviewed_cv_version_id"]) == ("delivered", "Shivam", 7)
    assert ("user", check["id"]) in _quiet_notifications


def test_linkedin_delivery_needs_a_note_and_valid_blocks() -> None:
    store = InMemoryChecks()
    check = _queued_linkedin(store)
    hc.claim(store, check["id"], "Shivam")

    with pytest.raises(hc.CheckInputInvalid):
        hc.deliver(store, check["id"], note="Ready.", reviewer_name="Shivam", blocks={"headline": "x"})
    too_long = {**BLOCKS, "headline": "x" * (hc.HEADLINE_MAX + 1)}
    with pytest.raises(hc.CheckInputInvalid):
        hc.deliver(store, check["id"], note="Ready.", reviewer_name="Shivam", blocks=too_long)
    six_skills = {**BLOCKS, "skills": ["a", "b", "c", "d", "e", "f"]}
    with pytest.raises(hc.CheckInputInvalid):
        hc.deliver(store, check["id"], note="Ready.", reviewer_name="Shivam", blocks=six_skills)

    done = hc.deliver(store, check["id"], note="Ready.", reviewer_name="Shivam", blocks=BLOCKS)
    assert done["status"] == "delivered"
    assert done["blocks"]["delete"] == ["Duplicate Acme role"]


def test_only_a_queued_check_can_be_claimed_and_only_once() -> None:
    store = InMemoryChecks()
    held = hc.open_check(store, "u1", billing_payment_id="pay-1", job_id=None)
    with pytest.raises(hc.CheckConflict):
        hc.claim(store, held["id"], "Shivam")

    queued = hc.open_check(store, "u2", billing_payment_id="pay-2", job_id="job-1")
    hc.claim(store, queued["id"], "Shivam")
    with pytest.raises(hc.CheckConflict):
        hc.claim(store, queued["id"], "Shivam")


def test_closing_the_paste_call_clears_the_whatsapp_number_either_way() -> None:
    store = InMemoryChecks()
    pasted, skipped = _queued_linkedin(store, "u1"), _queued_linkedin(store, "u2")
    for check in (pasted, skipped):
        hc.claim(store, check["id"], "Shivam")
        hc.deliver(store, check["id"], note="Ready.", reviewer_name="Shivam", blocks=BLOCKS)

    assert {c["id"] for c in store.calls_to_close()} == {pasted["id"], skipped["id"]}
    yes = hc.close_call(store, pasted["id"], pasted=True)
    no = hc.close_call(store, skipped["id"], pasted=False)
    assert store.calls_to_close() == []

    assert yes["contact_whatsapp"] is None and yes["pasted_at"]
    assert no["contact_whatsapp"] is None and not no.get("pasted_at")
    with pytest.raises(hc.CheckConflict):
        hc.close_call(store, pasted["id"], pasted=True)


def test_a_cv_check_ends_in_a_call_too() -> None:
    """ENG5: the ₹199 check comes with a 30-minute call, whichever kind. A CV
    check has nothing to paste, so `pasted` is never recorded for it."""
    store = InMemoryChecks()
    check = hc.open_check(store, "u1", billing_payment_id="pay-1", job_id="job-1")
    hc.set_contact(store, "u1", check["id"], "98765 43210")
    hc.claim(store, check["id"], "Shivam")
    with pytest.raises(hc.CheckConflict):
        hc.close_call(store, check["id"], pasted=False)  # the call follows the delivery
    hc.deliver(store, check["id"], note="Done.", reviewer_name="Shivam", reviewed_cv_version_id=3)

    assert [c["id"] for c in store.calls_to_close()] == [check["id"]]
    closed = hc.close_call(store, check["id"], pasted=True)
    assert closed["call_closed_at"] and closed["contact_whatsapp"] is None
    assert not closed.get("pasted_at")
    assert store.calls_to_close() == []


def test_the_owner_gives_the_call_number_before_the_call_closes() -> None:
    store = InMemoryChecks()
    check = hc.open_check(store, "u1", billing_payment_id="pay-1", job_id="job-1")
    assert not check.get("contact_whatsapp")  # the stakes door opens with no number

    given = hc.set_contact(store, "u1", check["id"], "098765 43210")
    assert (given["status"], given["contact_whatsapp"]) == ("queued", "+919876543210")

    with pytest.raises(hc.CheckNotFound):
        hc.set_contact(store, "u2", check["id"], "9876543210")
    with pytest.raises(hc.CheckInputInvalid):
        hc.set_contact(store, "u1", check["id"], "call me")

    hc.claim(store, check["id"], "Shivam")
    hc.deliver(store, check["id"], note="Done.", reviewer_name="Shivam", reviewed_cv_version_id=3)
    hc.close_call(store, check["id"], pasted=False)
    with pytest.raises(hc.CheckConflict):
        hc.set_contact(store, "u1", check["id"], "9876543210")
    assert store.by_id(check["id"])["contact_whatsapp"] is None


# ── the ₹599 pack's checks (§10.3) ──────────────────────────────────────────


def _full_pack(store: InMemoryChecks, user: str = "u1", payment: str = "pay-599") -> list[dict[str, Any]]:
    first = hc.open_check(store, user, billing_payment_id=payment, job_id=None)
    return [first] + [hc.open_pack_check(store, user, pack_payment_id=payment, pack_slot=s) for s in hc.PACK_SLOTS]


def test_a_full_pack_holds_two_checks_and_queues_the_search_call(_quiet_notifications: list) -> None:
    store = InMemoryChecks()
    cv, linkedin, search = _full_pack(store)

    assert [c["status"] for c in (cv, linkedin)] == ["unassigned", "unassigned"]
    assert (search["status"], search["kind"], search["pack_slot"]) == ("queued", "search", 3)
    due = datetime.fromisoformat(search["due_at"]) - datetime.fromisoformat(search["slot_starts_at"])
    assert due == timedelta(hours=24)
    assert _quiet_notifications == [("reviewer", search["id"])]  # only the call has work yet

    again = [hc.open_pack_check(store, "u1", pack_payment_id="pay-599", pack_slot=s) for s in hc.PACK_SLOTS]
    assert [c["id"] for c in again] == [linkedin["id"], search["id"]]
    assert len(store.rows) == 3


def test_a_pack_has_slots_2_and_3_only() -> None:
    with pytest.raises(ValueError):
        hc.open_pack_check(InMemoryChecks(), "u1", pack_payment_id="pay-599", pack_slot=1)


def test_a_search_call_is_delivered_with_a_note_and_then_closed() -> None:
    store = InMemoryChecks()
    search = _full_pack(store)[2]
    hc.claim(store, search["id"], "Shivam")
    with pytest.raises(hc.CheckInputInvalid):
        hc.deliver(store, search["id"], note=" ", reviewer_name="Shivam")

    done = hc.deliver(store, search["id"], note="Three career pages, two roles. Drafts with AI, checks by hand.", reviewer_name="Shivam")
    assert done["status"] == "delivered" and not done.get("blocks") and not done.get("reviewed_cv_version_id")
    assert [c["id"] for c in store.calls_to_close()] == [search["id"]]
    closed = hc.close_call(store, search["id"], pasted=True)
    assert closed["contact_whatsapp"] is None and not closed.get("pasted_at")


def test_one_number_reaches_every_call_of_the_pack() -> None:
    store = InMemoryChecks()
    cv, linkedin, search = _full_pack(store)
    hc.assign_job(store, "u1", cv["id"], "job-1")

    hc.set_contact(store, "u1", search["id"], "9876543210")

    for check in (cv, linkedin, search):
        assert store.by_id(check["id"])["contact_whatsapp"] == "+919876543210"
    other = hc.open_check(store, "u1", billing_payment_id="pay-199", job_id="job-2")
    assert not store.by_id(other["id"]).get("contact_whatsapp")  # another payment's check is its own


def test_a_sibling_keeps_the_number_it_already_has() -> None:
    store = InMemoryChecks()
    cv, linkedin, search = _full_pack(store)
    hc.assign_linkedin(store, "u1", linkedin["id"], linkedin_url=URL, whatsapp="9123456780")

    hc.set_contact(store, "u1", search["id"], "9876543210")

    assert store.by_id(linkedin["id"])["contact_whatsapp"] == "+919123456780"
    assert store.by_id(cv["id"])["contact_whatsapp"] == "+919876543210"


# ── the 5,000-coin LinkedIn path ────────────────────────────────────────────


def test_coins_buy_a_queued_linkedin_check(monkeypatch: pytest.MonkeyPatch) -> None:
    store = InMemoryChecks()
    charged: list[dict[str, Any]] = []

    async def _charge(user_id: str, amount: int, action: str, **kw: Any) -> int:
        charged.append({"user": user_id, "amount": amount, "action": action, **kw})
        return 0

    monkeypatch.setattr(hc.xp_service, "charge_or_raise", _charge)
    check = asyncio.run(hc.open_linkedin_with_coins(store, "u1", linkedin_url=URL, whatsapp="9876543210"))

    assert (check["status"], check["kind"], check.get("billing_payment_id")) == ("queued", "linkedin", None)
    assert charged == [
        {"user": "u1", "amount": 5000, "action": "linkedin_check", "floor": 0, "ref_table": "human_checks", "ref_id": check["id"]}
    ]


def test_a_refused_coin_charge_leaves_no_check(monkeypatch: pytest.MonkeyPatch, _quiet_notifications: list) -> None:
    store = InMemoryChecks()

    async def _refuse(user_id: str, amount: int, action: str, **_kw: Any) -> int:
        raise hc.xp_service.InsufficientXPError(amount=amount, balance=3000, action=action)

    monkeypatch.setattr(hc.xp_service, "charge_or_raise", _refuse)
    with pytest.raises(hc.xp_service.InsufficientXPError):
        asyncio.run(hc.open_linkedin_with_coins(store, "u1", linkedin_url=URL, whatsapp="9876543210"))

    assert store.rows == {}
    assert _quiet_notifications == []


def test_bad_intake_charges_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    store = InMemoryChecks()
    monkeypatch.setattr(hc.xp_service, "charge_or_raise", lambda *a, **k: pytest.fail("no charge on bad intake"))
    with pytest.raises(hc.CheckInputInvalid):
        asyncio.run(hc.open_linkedin_with_coins(store, "u1", linkedin_url="not a url", whatsapp="9876543210"))
    assert store.rows == {}


# ── the reviewer's first draft (ADR-0016) ───────────────────────────────────

CV = {
    "summary": "GTM lead.",
    "experience": [
        {"company": "Capgemini", "role": "Sales Manager", "dates": "May 2025 – Present", "bullets": ["€500K+ booked"]},
        {"company": "JLL", "role": "Data Engineer", "dates": "Aug 2020 – Jul 2022", "bullets": ["Dashboards for 50+ clients"]},
    ],
    "education": [{"degree": "MBA", "institution": "IIM Lucknow", "dates": "2024"}],
    "skills_line": "GTM, Sales, Power BI, Azure, SQL, Python",
    "projects": [],
    "certs": [],
}


def test_draft_copies_roles_from_the_cv_and_never_takes_the_models() -> None:
    model = {
        "headline": "Data & AI GTM | €500K+",
        "about": "I booked €500K+.",
        "experience": [
            {"index": 0, "text": "Booked €500K+."},
            {"index": 7, "text": "A role the CV does not have."},
        ],
        "skills": ["GTM", "Kubernetes", "SQL"],
        "featured": "",
    }
    blocks = linkedin_draft.build_blocks(CV, model, source=linkedin_draft._cv_text(CV))

    assert [(e["company"], e["title"], e["dates"]) for e in blocks["experience"]] == [
        ("Capgemini", "Sales Manager", "May 2025 – Present"),
        ("JLL", "Data Engineer", "Aug 2020 – Jul 2022"),
    ]
    assert blocks["experience"][0]["text"] == "Booked €500K+."
    assert blocks["experience"][1]["text"] == "• Dashboards for 50+ clients"  # model wrote nothing for it
    assert "Kubernetes" not in blocks["skills"]
    assert blocks["skills"][:2] == ["GTM", "SQL"] and len(blocks["skills"]) == hc.SKILLS_MAX
    assert blocks["education"] == ["MBA · IIM Lucknow · 2024"]
    assert blocks["delete"] == []
    assert blocks["flags"] == []


def test_draft_flags_a_number_the_cv_never_states() -> None:
    model = {"headline": "GTM lead", "about": "Grew revenue 40% and booked €500K+.", "experience": [], "skills": []}
    blocks = linkedin_draft.build_blocks(CV, model, source=linkedin_draft._cv_text(CV))
    assert blocks["flags"] == ["Number not in the CV: 40%"]
