"""The golden-list digest — #55 S4 / #59 (`ARCHITECTURE_GOLDEN_DIGEST.md`).

The one email Myro sends about jobs, and only to the people Shivam names as
job-hunting now (`user_profiles.golden_list_since`). It reads what already
exists and spends no judge call:

1. **Unfinished** — a CV they tailored for a job they have not applied to, on a
   listing still open. "Apply with it" leads, because it is one click from the
   north star.
2. **Jobs worth applying to.** The first email carries every job on their /market
   list, best first (Shivam, 2026-10-14) — the judge's whole answer, not a teaser.
   Every later email carries only what is new: verdicts written since the last
   digest that clear the list's bar (`published_list.worth_showing`), that Verdict
   Currency says are theirs, that Admission still shows, that they have not
   collected, and that no earlier digest already offered (a re-read card gets a
   fresh timestamp, and is not news).

Nothing in either → no email. At most one every three days. Each send is a
`user_notifications` row (kind `golden_digest`, `source_id` the UTC day): the
row is the cadence check, the in-app copy in the bell, and — through the unique
`(user_id, kind, source_id)` index — the claim that refuses a second send.

`DigestStore` and `Mailer` are seams so `send_due` runs end to end in tests with
no network. Nothing sends until the schedule exists, and the schedule waits on
Shivam approving a preview (`ARCHITECTURE_GOLDEN_DIGEST.md` §8 S4).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

logger = logging.getLogger(__name__)

KIND = "golden_digest"
EVERY = timedelta(days=3)
MAX_UNFINISHED = 2
UTM = "utm_source=golden_digest"
_JOB_LINK = re.compile(r"jobId=([^&\s]+)")


@dataclass(frozen=True)
class Line:
    job_id: str
    title: str
    company: str | None
    #: `/collections?jobId=` (apply: the job's row, where Apply is the next step)
    #: or `/cv?jobId=` (tailor: the Tailor CV door).
    path: str
    fit: int | None = None


@dataclass(frozen=True)
class Digest:
    user_id: str
    unfinished: list[Line]
    new: list[Line]
    #: The member's first digest: `new` is their whole list, not what changed.
    first: bool = False

    @property
    def subject(self) -> str:
        if self.unfinished:
            lead = self.unfinished[0]
            return f"Apply with the CV you tailored for {lead.company or lead.title}"
        n = len(self.new)
        fresh = "" if self.first else "new "
        return f"{n} {fresh}job{'s' if n != 1 else ''} worth applying to"

    @property
    def lead(self) -> Line:
        return (self.unfinished or self.new)[0]


@dataclass
class SendReport:
    considered: int = 0
    sent: int = 0
    failed: int = 0
    skipped: dict[str, int] = field(default_factory=dict)
    previews: list[tuple[str, str, str]] = field(default_factory=list)  # (user_id, subject, text)

    def skip(self, reason: str) -> None:
        self.skipped[reason] = self.skipped.get(reason, 0) + 1


# ── the store and the mailer ────────────────────────────────────────────────


class DigestStore(Protocol):
    def members(self) -> list[dict[str, Any]]:
        """`{user_id, email, full_name, golden_list_since}` for each member who is
        on the list, subscribed, and not a test account."""

    def last_sent_at(self, user_id: str) -> datetime | None:
        """When the last digest that did not fail was written."""

    def unfinished(self, user_id: str) -> list[dict[str, Any]]:
        """Tailored job CVs, newest first: `{job_id, job_title, company_name}`,
        already narrowed to open listings and jobs not yet applied to."""

    def listed(self, user_id: str) -> list[dict[str, Any]]:
        """Every job on their /market list, best first:
        `{job_id, job_title, company_name, match_score}`."""

    def new_worth(self, user_id: str, since: datetime) -> list[dict[str, Any]]:
        """Match rows written after `since` that the list would show and the person
        has not collected, best first."""

    def offered(self, user_id: str) -> set[str]:
        """Job ids an earlier digest (one that did not fail) already offered."""

    def claim(self, user_id: str, day: str, digest: Digest, text: str) -> int | None:
        """Write today's row in state `processing`. None when today's row exists."""

    def mark(self, row_id: int, state: str) -> None:
        """`ready` once emailed, `failed` when the send did not go."""


class Mailer(Protocol):
    def send(self, *, to: str, subject: str, text: str, headers: dict[str, str]) -> bool: ...


# ── unsubscribe tokens ──────────────────────────────────────────────────────


def _key() -> bytes:
    # The secret pg_cron already presents (`security/refresh_secret.py`), used
    # under its own purpose label so a token is never a credential anywhere else.
    return os.environ.get("MYRO_ANALYTICS_REFRESH_SECRET", "").strip().encode()


def _mac(user_id: str) -> str:
    digest = hmac.new(_key(), f"{KIND}:unsubscribe:{user_id}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest[:18]).decode().rstrip("=")


def unsubscribe_token(user_id: str) -> str | None:
    """`<user_id>.<mac>`, or None when this process holds no secret to sign with."""
    if not _key():
        return None
    return f"{user_id}.{_mac(user_id)}"


def user_for_token(token: str) -> str | None:
    if not _key() or "." not in (token or ""):
        return None
    user_id, _, mac = token.rpartition(".")
    if not user_id or not hmac.compare_digest(mac, _mac(user_id)):
        return None
    return user_id


# ── compose and send ────────────────────────────────────────────────────────


def compose(user_id: str, *, since: datetime, store: DigestStore, first: bool = False) -> Digest | None:
    """What this person's digest would say, or None when there is nothing to say."""
    unfinished = [
        Line(
            job_id=str(row["job_id"]),
            title=str(row.get("job_title") or "this role"),
            company=row.get("company_name"),
            path=f"/collections?jobId={row['job_id']}",
        )
        for row in store.unfinished(user_id)[:MAX_UNFINISHED]
    ]
    held = {line.job_id for line in unfinished}
    if first:
        rows = store.listed(user_id)
    else:
        already = store.offered(user_id)
        rows = [row for row in store.new_worth(user_id, since) if str(row["job_id"]) not in already]
    new = [
        Line(
            job_id=str(row["job_id"]),
            title=str(row.get("job_title") or "A role"),
            company=row.get("company_name"),
            path=f"/cv?jobId={row['job_id']}",
            fit=row.get("match_score"),
        )
        for row in rows
        if str(row["job_id"]) not in held
    ]
    if not unfinished and not new:
        return None
    return Digest(user_id=user_id, unfinished=unfinished, new=new, first=first)


def _url(app_url: str, path: str) -> str:
    return f"{app_url}{path}&{UTM}"


def render(digest: Digest, *, app_url: str, name: str | None, unsubscribe_url: str | None) -> str:
    """Plain text, short lines, full URLs — read on a phone first (§7)."""
    first = (name or "").strip().split(" ")[0]
    if first.isupper():  # "RAJ KISHORE" as typed at signup reads as shouting
        first = first.title()
    lines = [f"Hi {first}," if first else "Hi,", ""]
    for job in digest.unfinished:
        at = f" at {job.company}" if job.company else ""
        lines += [f"You tailored a CV for {job.title}{at}. Apply with it:", _url(app_url, job.path), ""]
    if digest.new:
        if digest.first:
            heading = "Every job on your list worth applying to, best first:"
        elif digest.unfinished:
            heading = "New jobs worth applying to:"
        else:
            heading = "Jobs worth applying to, new since your last email:"
        lines += [heading, ""]
        for job in digest.new:
            at = f", {job.company}" if job.company else ""
            fit = f" · {job.fit}% fit" if job.fit is not None else ""
            lines += [f"{job.title}{at}{fit}", f"Tailor your CV: {_url(app_url, job.path)}", ""]
    lines += ["Myro"]
    if unsubscribe_url:
        lines += ["", f"Stop these emails: {unsubscribe_url}"]
    return "\n".join(lines)


def send_due(
    now: datetime,
    *,
    store: DigestStore,
    mailer: Mailer,
    apply: bool,
    app_url: str,
    api_url: str | None = None,
    preview_to: str | None = None,
) -> SendReport:
    """Every member due a digest gets one.

    `apply=False` composes and reports, and writes and sends nothing.
    `preview_to` sends each member's digest to that inbox instead, ignoring the
    three-day cadence and writing nothing — the S4 check before anything goes live.
    """
    report = SendReport()
    day = now.astimezone(timezone.utc).date().isoformat()
    for member in store.members():
        report.considered += 1
        user_id = str(member["user_id"])
        last = store.last_sent_at(user_id)
        if preview_to is None and last is not None and now - last < EVERY:
            report.skip("cadence")
            continue
        since = last or _parse(member.get("golden_list_since")) or now - EVERY
        digest = compose(user_id, since=since, store=store, first=last is None)
        if digest is None:
            report.skip("nothing_to_say")
            continue
        token = unsubscribe_token(user_id)
        text = render(
            digest,
            app_url=app_url,
            name=member.get("full_name"),
            unsubscribe_url=f"{app_url}/unsubscribe?t={token}" if token else None,
        )
        report.previews.append((user_id, digest.subject, text))
        if preview_to is not None:
            mailer.send(to=preview_to, subject=f"[preview] {digest.subject}", text=text, headers={})
            continue
        if not apply:
            continue
        if not member.get("email"):
            report.skip("no_email")
            continue
        row_id = store.claim(user_id, day, digest, text)
        if row_id is None:
            report.skip("claimed")
            continue
        headers = (
            {
                "List-Unsubscribe": f"<{api_url}/email/unsubscribe?t={token}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
            if api_url and token else {}
        )
        if mailer.send(to=member["email"], subject=digest.subject, text=text, headers=headers):
            store.mark(row_id, "ready")
            report.sent += 1
        else:
            store.mark(row_id, "failed")
            report.failed += 1
    logger.warning(
        "metric golden_digest.run apply=%s preview=%s considered=%d sent=%d failed=%d skipped=%s",
        apply, preview_to is not None, report.considered, report.sent, report.failed, report.skipped,
    )
    return report


def _parse(value: Any) -> datetime | None:
    if not value:
        return None
    moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


# ── the Supabase store and the Resend mailer ────────────────────────────────


class SupabaseStore:
    """The production store, on the service client (the digest runs for many people)."""

    def __init__(self, db: Any) -> None:
        from app.repositories.jobs import JobsRepository

        self._db = db
        self._jobs = JobsRepository(db, db)

    def members(self) -> list[dict[str, Any]]:
        rows = (
            self._db.table("user_profiles")
            .select("id, full_name, golden_list_since")
            .not_.is_("golden_list_since", "null")
            .is_("digest_unsubscribed_at", "null")
            .eq("is_test_account", False)
            .execute()
        ).data or []
        out = []
        for row in rows:
            user = self._db.auth.admin.get_user_by_id(row["id"]).user
            out.append({
                "user_id": row["id"],
                "email": getattr(user, "email", None),
                "full_name": row.get("full_name"),
                "golden_list_since": row.get("golden_list_since"),
            })
        return out

    def last_sent_at(self, user_id: str) -> datetime | None:
        rows = (
            self._db.table("user_notifications")
            .select("created_at")
            .eq("user_id", user_id)
            .eq("kind", KIND)
            .neq("state", "failed")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        ).data or []
        return _parse(rows[0]["created_at"]) if rows else None

    def _sent(self, user_id: str) -> set[str]:
        """Jobs with a Yes (CONTEXT → Application Yes): their tailored CV went out."""
        rows = (
            self._db.table("job_applications").select("job_id")
            .eq("user_id", user_id).not_.is_("applied_at", "null").execute()
        ).data or []
        return {str(r["job_id"]) for r in rows}

    def unfinished(self, user_id: str) -> list[dict[str, Any]]:
        from app.services.job_intelligence_policy import is_recommendable_listing

        versions = (
            self._db.table("cv_versions")
            .select("job_id, created_at")
            .eq("user_id", user_id)
            .not_.is_("job_id", "null")
            .order("created_at", desc=True)
            .execute()
        ).data or []
        sent = self._sent(user_id)
        job_ids = list(dict.fromkeys(
            str(v["job_id"]) for v in versions if str(v["job_id"]) not in sent
        ))
        jobs = {str(j["job_id"]): j for j in self._jobs.get_jobs_by_ids(job_ids)} if job_ids else {}
        return [
            {"job_id": jid, "job_title": jobs[jid].get("job_title"), "company_name": jobs[jid].get("company_name")}
            for jid in job_ids
            if jid in jobs and is_recommendable_listing(jobs[jid])
        ]

    def listed(self, user_id: str) -> list[dict[str, Any]]:
        from app.services.matching import published_list

        cards, _judgment = published_list.assemble(self._jobs, user_id)
        return [
            {
                "job_id": card["job_id"],
                "job_title": card.get("job_title"),
                "company_name": card.get("company_name"),
                "match_score": card.get("match_score"),
            }
            for card in cards
        ]

    def offered(self, user_id: str) -> set[str]:
        rows = (
            self._db.table("user_notifications")
            .select("body")
            .eq("user_id", user_id)
            .eq("kind", KIND)
            .neq("state", "failed")
            .execute()
        ).data or []
        # The row's body is the email as sent; every job in it is a `jobId=` link.
        return {match for row in rows for match in _JOB_LINK.findall(row.get("body") or "")}

    def new_worth(self, user_id: str, since: datetime) -> list[dict[str, Any]]:
        from app.schemas.jobs import MatchEval
        from app.services.matching import admission, published_list, targeting, verdict_currency

        profile = targeting.for_ranking(self._jobs, user_id).ranking_profile()
        profile["baseline_version_id"] = self._jobs.get_latest_baseline_id(user_id)
        currency = verdict_currency.for_profile(profile)
        collected = set(self._applications(user_id))
        rows = [
            row for row in self._jobs.get_user_match_stack(user_id)
            if currency.of(row) != "foreign"
            and published_list.worth_showing(row.get("overall_score"), row.get("recommendation"))
            and str(row.get("job_id")) not in collected
            and (_parse(row.get("computed_at")) or since) > since
        ]
        out = []
        for row in published_list.order_by_score(admission.admitted(profile, rows)):
            job = row.get("jobs") or {}
            out.append({
                "job_id": str(row["job_id"]),
                "job_title": job.get("job_title"),
                "company_name": job.get("company_name"),
                "match_score": MatchEval.model_validate(row).match_score,
            })
        return out

    def claim(self, user_id: str, day: str, digest: Digest, text: str) -> int | None:
        from postgrest.exceptions import APIError

        try:
            rows = (
                self._db.table("user_notifications")
                .insert({
                    "user_id": user_id,
                    "kind": KIND,
                    "source_id": f"{KIND}:{day}",
                    "title": digest.subject,
                    "body": text,
                    "job_id": digest.lead.job_id,
                    "action_url": digest.lead.path,
                    "match_count": len(digest.unfinished) + len(digest.new),
                    "state": "processing",
                })
                .execute()
            ).data or []
        except APIError as exc:
            if exc.code == "23505":  # today's row exists: another run claimed it
                return None
            raise
        return int(rows[0]["id"]) if rows else None

    def mark(self, row_id: int, state: str) -> None:
        self._db.table("user_notifications").update({"state": state}).eq("id", row_id).execute()


class ResendMailer:
    def send(self, *, to: str, subject: str, text: str, headers: dict[str, str]) -> bool:
        from app.services.email_service import send_email

        return send_email(to=to, subject=subject, text=text, headers=headers)
