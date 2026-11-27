"""Human Check — the promise the packs sell (ARCHITECTURE_PAYMENTS.md §3 D, §10, ENG3, ENG5).

A named reviewer returns one check within 24 hours, then the two talk on a
30-minute call booked on WhatsApp. Two kinds:

- `cv_job` — the user's tailored CV read against one job, walked through on
  the call.
- `linkedin` — the user's LinkedIn profile rewritten for them to paste on the
  call. Myro never fetches the profile and never logs in as the user; the
  reviewer opens the public `/in/` URL in their own browser.

The number exists only to book that call: the owner gives it (`set_contact`, or
with the LinkedIn intake) and closing the call clears it.

Lifecycle: unassigned → queued → in_review → delivered. A check bought without
a job or a profile is `unassigned` until the user uses it. The 24-hour clock
starts when the check is queued into a free slot; with every slot taken it
starts when the earliest open check falls due, and the buyer is told that time
before paying. A late check is delivered late, not refunded.

Every transition is a compare-and-set on `status`, so two taps never move a
check twice.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

from app.config import settings
from app.database import get_supabase_admin
from app.services import email_service, xp_service
from app.services.reach_target import parse_linkedin_profile_url

logger = logging.getLogger(__name__)

MAX_OPEN_CHECKS = 5
CHECK_HOURS = 24
LINKEDIN_CHECK_COINS = 5000
_OPEN = ("queued", "in_review")

# LinkedIn's own field limits.
HEADLINE_MAX = 220
ABOUT_MAX = 2600
EXPERIENCE_TEXT_MAX = 2000
SKILLS_MAX = 5


class CheckNotFound(LookupError):
    pass


class CheckConflict(RuntimeError):
    """The check is not in the state this transition needs."""


class CheckInputInvalid(ValueError):
    pass


class HumanCheckStore(Protocol):
    def by_id(self, check_id: str) -> dict[str, Any] | None: ...
    def by_payment(self, billing_payment_id: str) -> dict[str, Any] | None: ...
    def insert(self, row: dict[str, Any]) -> dict[str, Any] | None:
        """None when the billing_payment_id already has a check."""
        ...
    def update_if(self, check_id: str, expect_status: str, patch: dict[str, Any]) -> dict[str, Any] | None: ...
    def delete(self, check_id: str) -> None: ...
    def open_due_ats(self) -> list[datetime]: ...
    def for_user(self, user_id: str) -> list[dict[str, Any]]: ...
    def open_queue(self) -> list[dict[str, Any]]: ...
    def calls_to_close(self) -> list[dict[str, Any]]:
        """Delivered checks, any kind, whose call is still open."""
        ...


def _parse(value: Any) -> datetime:
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


class SupabaseHumanCheckStore:
    def __init__(self, admin: Any | None = None) -> None:
        self._admin = admin or get_supabase_admin()

    def _t(self) -> Any:
        return self._admin.table("human_checks")

    def by_id(self, check_id: str) -> dict[str, Any] | None:
        res = self._t().select("*").eq("id", check_id).maybe_single().execute()
        return (res.data if res else None) or None

    def by_payment(self, billing_payment_id: str) -> dict[str, Any] | None:
        res = self._t().select("*").eq("billing_payment_id", billing_payment_id).maybe_single().execute()
        return (res.data if res else None) or None

    def insert(self, row: dict[str, Any]) -> dict[str, Any] | None:
        if row.get("billing_payment_id"):
            res = self._t().upsert(row, on_conflict="billing_payment_id", ignore_duplicates=True).execute()
        else:
            res = self._t().insert(row).execute()
        return res.data[0] if res.data else None

    def update_if(self, check_id: str, expect_status: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        res = self._t().update(patch).eq("id", check_id).eq("status", expect_status).execute()
        return res.data[0] if res.data else None

    def delete(self, check_id: str) -> None:
        self._t().delete().eq("id", check_id).execute()

    def open_due_ats(self) -> list[datetime]:
        res = self._t().select("due_at").in_("status", list(_OPEN)).execute()
        return [_parse(r["due_at"]) for r in (res.data or []) if r.get("due_at")]

    def for_user(self, user_id: str) -> list[dict[str, Any]]:
        res = self._t().select("*").eq("user_id", user_id).order("created_at", desc=True).limit(20).execute()
        return list(res.data or [])

    def open_queue(self) -> list[dict[str, Any]]:
        res = self._t().select("*").in_("status", list(_OPEN)).order("due_at").limit(50).execute()
        return list(res.data or [])

    def calls_to_close(self) -> list[dict[str, Any]]:
        res = (
            self._t()
            .select("*")
            .eq("status", "delivered")
            .is_("call_closed_at", "null")
            .order("delivered_at")
            .limit(50)
            .execute()
        )
        return list(res.data or [])


# ── the clock ───────────────────────────────────────────────────────────────


def slot_start(open_due: list[datetime], now: datetime) -> datetime:
    """When a check queued now gets a reviewer: now while a slot is free, else
    when the open check that frees the next slot falls due."""
    if len(open_due) < MAX_OPEN_CHECKS:
        return now
    return max(now, sorted(open_due)[len(open_due) - MAX_OPEN_CHECKS])


@dataclass(frozen=True)
class Availability:
    checks_full: bool
    ready_by: datetime  # when a check bought now would be returned
    # Of MAX_OPEN_CHECKS, how many hold no check. Counted, not clocked: a late
    # check is still on the reviewer's desk, so it holds its slot even after
    # `slot_start` has stopped waiting for it.
    slots_open: int


def availability(store: HumanCheckStore, now: datetime | None = None) -> Availability:
    now = now or datetime.now(timezone.utc)
    open_due = store.open_due_ats()
    start = slot_start(open_due, now)
    return Availability(
        checks_full=start > now,
        ready_by=start + timedelta(hours=CHECK_HOURS),
        slots_open=max(0, MAX_OPEN_CHECKS - len(open_due)),
    )


def _clock(store: HumanCheckStore, now: datetime) -> dict[str, str]:
    start = slot_start(store.open_due_ats(), now)
    return {
        "slot_starts_at": start.isoformat(),
        "due_at": (start + timedelta(hours=CHECK_HOURS)).isoformat(),
    }


# ── intake ──────────────────────────────────────────────────────────────────


_WA_STRIP = re.compile(r"[\s\-().]")


def normalize_whatsapp(raw: str) -> str:
    """A WhatsApp number as +<country><number>. A bare 10-digit Indian mobile
    gets +91. Used only to book the call."""
    digits = _WA_STRIP.sub("", raw or "")
    if re.fullmatch(r"[6-9]\d{9}", digits):
        return f"+91{digits}"
    if re.fullmatch(r"0[6-9]\d{9}", digits):
        return f"+91{digits[1:]}"
    if re.fullmatch(r"\+\d{8,15}", digits):
        return digits
    raise CheckInputInvalid("Add a WhatsApp number we can reach you on.")


def _linkedin_intake(linkedin_url: str, whatsapp: str) -> dict[str, str]:
    url = parse_linkedin_profile_url(linkedin_url or "")
    if url is None:
        raise CheckInputInvalid("Paste your LinkedIn profile URL (linkedin.com/in/…).")
    return {"linkedin_url": url, "contact_whatsapp": normalize_whatsapp(whatsapp)}


def _text(value: Any, limit: int, field: str) -> str:
    if not isinstance(value, str):
        raise CheckInputInvalid(f"{field} must be text.")
    text = value.strip()
    if len(text) > limit:
        raise CheckInputInvalid(f"{field} is over LinkedIn's {limit} characters.")
    return text


def _lines(value: Any, field: str, *, limit: int = 300) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise CheckInputInvalid(f"{field} must be a list.")
    return [t for t in (_text(v, limit, field) for v in value) if t]


def validate_blocks(raw: Any) -> dict[str, Any]:
    """The signed LinkedIn blocks the user will paste, in LinkedIn's limits."""
    if not isinstance(raw, dict):
        raise CheckInputInvalid("Blocks must be an object.")
    headline = _text(raw.get("headline", ""), HEADLINE_MAX, "Headline")
    about = _text(raw.get("about", ""), ABOUT_MAX, "About")
    if not headline or not about:
        raise CheckInputInvalid("A LinkedIn rewrite needs a headline and an About.")
    experience_raw = raw.get("experience") or []
    if not isinstance(experience_raw, list):
        raise CheckInputInvalid("Experience must be a list.")
    experience = []
    for entry in experience_raw:
        if not isinstance(entry, dict):
            raise CheckInputInvalid("Each experience entry must be an object.")
        experience.append(
            {
                "company": _text(entry.get("company", ""), 200, "Company"),
                "title": _text(entry.get("title", ""), 200, "Title"),
                "dates": _text(entry.get("dates", ""), 80, "Dates"),
                "text": _text(entry.get("text", ""), EXPERIENCE_TEXT_MAX, "Experience"),
            }
        )
    skills = _lines(raw.get("skills"), "Skills", limit=80)
    if len(skills) > SKILLS_MAX:
        raise CheckInputInvalid(f"Pick at most {SKILLS_MAX} skills to pin.")
    return {
        "headline": headline,
        "about": about,
        "experience": experience,
        "education": _lines(raw.get("education"), "Education"),
        "skills": skills,
        "featured": _text(raw.get("featured", ""), 300, "Featured"),
        "delete": _lines(raw.get("delete"), "Delete list"),
    }


# ── transitions ─────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _own(store: HumanCheckStore, user_id: str, check_id: str) -> dict[str, Any]:
    row = store.by_id(check_id)
    if row is None or str(row.get("user_id")) != user_id:
        raise CheckNotFound(check_id)
    return row


def open_check(store: HumanCheckStore, user_id: str, *, billing_payment_id: str, job_id: str | None) -> dict[str, Any]:
    """The Apply Pack's grant. Idempotent on `billing_payment_id`."""
    existing = store.by_payment(billing_payment_id)
    if existing:
        return existing
    row: dict[str, Any] = {"user_id": user_id, "billing_payment_id": billing_payment_id, "status": "unassigned"}
    if job_id:
        row.update(status="queued", kind="cv_job", job_id=job_id, **_clock(store, _now()))
    created = store.insert(row)
    if created is None:  # another arrival opened it first
        found = store.by_payment(billing_payment_id)
        if found is None:
            raise CheckConflict("check for this payment vanished")
        return found
    if created["status"] == "queued":
        notify_reviewer(created)
    return created


def assign_job(store: HumanCheckStore, user_id: str, check_id: str, job_id: str) -> dict[str, Any]:
    row = _own(store, user_id, check_id)
    if row["status"] != "unassigned":
        raise CheckConflict("This check is already in use.")
    patch = {"status": "queued", "kind": "cv_job", "job_id": job_id, **_clock(store, _now())}
    moved = store.update_if(check_id, "unassigned", patch)
    if moved is None:
        raise CheckConflict("This check is already in use.")
    notify_reviewer(moved)
    return moved


def assign_linkedin(
    store: HumanCheckStore, user_id: str, check_id: str, *, linkedin_url: str, whatsapp: str
) -> dict[str, Any]:
    intake = _linkedin_intake(linkedin_url, whatsapp)
    row = _own(store, user_id, check_id)
    if row["status"] != "unassigned":
        raise CheckConflict("This check is already in use.")
    patch = {"status": "queued", "kind": "linkedin", **intake, **_clock(store, _now())}
    moved = store.update_if(check_id, "unassigned", patch)
    if moved is None:
        raise CheckConflict("This check is already in use.")
    notify_reviewer(moved)
    return moved


async def open_linkedin_with_coins(
    store: HumanCheckStore, user_id: str, *, linkedin_url: str, whatsapp: str
) -> dict[str, Any]:
    """5,000 coins buys one LinkedIn check. The row is inserted first so the
    charge can name it; a charge that does not complete removes the row, so a
    check never exists that nobody paid for."""
    intake = _linkedin_intake(linkedin_url, whatsapp)
    row = store.insert(
        {"user_id": user_id, "status": "queued", "kind": "linkedin", **intake, **_clock(store, _now())}
    )
    if row is None:
        raise CheckConflict("Could not open the check.")
    try:
        await xp_service.charge_or_raise(
            user_id, LINKEDIN_CHECK_COINS, "linkedin_check", floor=0, ref_table="human_checks", ref_id=str(row["id"])
        )
    except BaseException:
        store.delete(str(row["id"]))
        raise
    notify_reviewer(row)
    return row


def set_contact(store: HumanCheckStore, user_id: str, check_id: str, whatsapp: str) -> dict[str, Any]:
    """The owner gives the number the call is booked on. Any time before the
    call closes: a check bought for a job opens queued with no number."""
    number = normalize_whatsapp(whatsapp)
    row = _own(store, user_id, check_id)
    if row.get("call_closed_at"):
        raise CheckConflict("This call has already happened.")
    moved = store.update_if(check_id, str(row["status"]), {"contact_whatsapp": number})
    if moved is None:
        raise CheckConflict("The check moved on. Try again.")
    return moved


def claim(store: HumanCheckStore, check_id: str, reviewer_name: str) -> dict[str, Any]:
    moved = store.update_if(check_id, "queued", {"status": "in_review", "reviewer_name": reviewer_name})
    if moved is None:
        raise CheckConflict("Only a queued check can be claimed.")
    return moved


def store_draft(store: HumanCheckStore, check_id: str, draft: dict[str, Any]) -> dict[str, Any] | None:
    return store.update_if(check_id, "in_review", {"draft": draft})


def deliver(
    store: HumanCheckStore,
    check_id: str,
    *,
    note: str,
    reviewer_name: str,
    reviewed_cv_version_id: int | None = None,
    blocks: Any = None,
) -> dict[str, Any]:
    row = store.by_id(check_id)
    if row is None:
        raise CheckNotFound(check_id)
    if row["status"] != "in_review":
        raise CheckConflict("Only a check in review can be delivered.")
    note = (note or "").strip()
    if not note:
        raise CheckInputInvalid("A delivered check needs a note.")
    patch: dict[str, Any] = {
        "status": "delivered",
        "note": note,
        "reviewer_name": reviewer_name,
        "delivered_at": _now().isoformat(),
    }
    if row["kind"] == "cv_job":
        if reviewed_cv_version_id is None:
            raise CheckInputInvalid("A CV check records the version you reviewed.")
        patch["reviewed_cv_version_id"] = reviewed_cv_version_id
    else:
        patch["blocks"] = validate_blocks(blocks)
    moved = store.update_if(check_id, "in_review", patch)
    if moved is None:
        raise CheckConflict("Only a check in review can be delivered.")
    notify_user(moved)
    return moved


def close_call(store: HumanCheckStore, check_id: str, *, pasted: bool) -> dict[str, Any]:
    """The reviewer closes the call, either kind. Clears the WhatsApp number
    either way: it existed only to book this call. `pasted` is recorded only
    for a LinkedIn check, where the call is the paste."""
    row = store.by_id(check_id)
    if row is None:
        raise CheckNotFound(check_id)
    if row["status"] != "delivered" or row.get("call_closed_at"):
        raise CheckConflict("Only a delivered check with an open call can be closed.")
    now = _now().isoformat()
    patch: dict[str, Any] = {"call_closed_at": now, "contact_whatsapp": None}
    linkedin = row.get("kind") == "linkedin"
    if linkedin and pasted:
        patch["pasted_at"] = now
    moved = store.update_if(check_id, "delivered", patch)
    if moved is None:
        raise CheckConflict("Only a delivered check can be closed.")
    logger.info("metric human_check.call_closed kind=%s pasted=%s", row.get("kind"), linkedin and pasted)
    return moved


# ── notifications ───────────────────────────────────────────────────────────


def _desk_link(check_id: str) -> str:
    return f"{settings.public_app_url()}/admin/checks?id={check_id}"


def notify_reviewer(row: dict[str, Any]) -> None:
    to = settings.human_check_reviewer_email.strip()
    if not to:
        logger.warning("metric human_check.reviewer_unset check=%s", row.get("id"))
        return
    kind = "LinkedIn rewrite" if row.get("kind") == "linkedin" else "CV check"
    sent = email_service.send_email(
        to=to,
        subject=f"Human check · {kind} · due {row.get('due_at')}",
        text=(
            f"A {kind} is queued.\n\n"
            f"Due: {row.get('due_at')}\n"
            f"Open it: {_desk_link(str(row.get('id')))}\n"
        ),
    )
    if not sent:
        logger.warning("metric human_check.reviewer_email_failed check=%s", row.get("id"))


def _user_email(user_id: str) -> str | None:
    res = get_supabase_admin().table("user_profiles").select("email").eq("id", user_id).maybe_single().execute()
    data = (res.data if res else None) or {}
    return data.get("email") or None


def notify_user(row: dict[str, Any]) -> None:
    linkedin = row.get("kind") == "linkedin"
    title = "Your LinkedIn is ready" if linkedin else f"Checked by {row.get('reviewer_name')}"
    action_url = "/cv?view=cv" if linkedin else f"/cv?view=cv&job={row.get('job_id')}"
    get_supabase_admin().table("user_notifications").insert(
        {
            "user_id": row["user_id"],
            "kind": "human_check",
            "title": title,
            "body": row.get("note"),
            "job_id": None if linkedin else row.get("job_id"),
            "source_id": str(row["id"]),
            "action_url": action_url,
        }
    ).execute()
    email = _user_email(str(row["user_id"]))
    if not email:
        return
    sent = email_service.send_email(
        to=email,
        subject=title,
        text=f"{row.get('note')}\n\n— {row.get('reviewer_name')}\n\n{settings.public_app_url()}{action_url}\n",
    )
    if not sent:
        logger.warning("metric human_check.user_email_failed check=%s", row.get("id"))
