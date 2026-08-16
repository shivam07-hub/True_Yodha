"""The Order and its lines — pure operations, no network, no formatting.

Every op returns a NEW Order plus a reversible log entry. Nothing here reads the
database and nothing here builds prose; both of those are separate modules, so
this one is testable with a dict and no fixtures.

The invariant this file exists to hold: **an unanswered line is not a kept line.**
The old pre-flight had one bag of strings and no way to say "Myro guessed this
and you never answered", so every guess reached the matcher as if the user had
confirmed it. Here a line is `kept` only because someone said yes (or reworded
it, which counts as yes) — `drop_unanswered` is what runs before dispatch, and
it is a no-op on anything the user actually answered.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field, replace
from typing import Any, Literal

LineKind = Literal["role", "location", "wont_take", "lean", "goal", "strength", "pay_floor"]
LineSource = Literal["user_said", "myro_inferred", "from_cv", "user_reworded"]
LineStatus = Literal["kept", "dropped", "unanswered"]
LineOrigin = Literal["preflight", "market", "cv_import", "memory_import"]

# Which confirm round a guess belongs to. Derived from `kind` rather than stored,
# so a line cannot claim a round its kind contradicts.
ROUND_OF_KIND: dict[str, str] = {
    "wont_take": "wont",
    "lean": "drawn",
    "goal": "about",
    "strength": "about",
}
ROUND_ORDER = ("wont", "drawn", "about")


@dataclass(frozen=True)
class OrderLine:
    id: str
    kind: LineKind
    #: One statement. No trailing period, no leading "No " — the prose module
    #: adds both back where the grammar wants them.
    text: str
    source: LineSource
    origin: LineOrigin
    status: LineStatus = "unanswered"
    source_note: str | None = None
    soft: bool = False
    #: Myro cannot run this line. Offers `reword` / `no` only — never `yes`.
    unusable: bool = False
    original_text: str | None = None
    answered_at: str | None = None
    #: Dedupe key against the store this line was imported from
    #: ("mem:<fact id>", "profile:career_goal"). NOT in the design handoff:
    #: without it every re-import re-adds the same guess, so the user answers
    #: "No large corporations" once and meets it again on the next open.
    ref: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "text": self.text,
            "source": self.source,
            "source_note": self.source_note,
            "origin": self.origin,
            "status": self.status,
            "soft": self.soft,
            "unusable": self.unusable,
            "original_text": self.original_text,
            "answered_at": self.answered_at,
            "ref": self.ref,
        }

    @staticmethod
    def from_dict(row: dict[str, Any]) -> "OrderLine":
        return OrderLine(
            id=str(row.get("id") or new_id()),
            kind=row.get("kind") or "wont_take",
            text=(row.get("text") or "").strip(),
            source=row.get("source") or "myro_inferred",
            origin=row.get("origin") or "preflight",
            status=row.get("status") or "unanswered",
            source_note=row.get("source_note") or None,
            soft=bool(row.get("soft")),
            unusable=bool(row.get("unusable")),
            original_text=row.get("original_text") or None,
            answered_at=row.get("answered_at") or None,
            ref=row.get("ref") or None,
        )


@dataclass(frozen=True)
class LogEntry:
    """One reversible change. `prev` is the whole prior line (or None for an add),
    which is what makes undo restore the exact status the line had — including
    `unanswered`, which a boolean "was it kept" flag would flatten to dropped."""

    id: str
    kind: Literal["add", "drop", "keep", "reword"]
    line_id: str
    text: str
    prev: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "kind": self.kind, "line_id": self.line_id, "text": self.text, "prev": self.prev}

    @staticmethod
    def from_dict(row: dict[str, Any]) -> "LogEntry":
        return LogEntry(
            id=str(row.get("id") or new_id()),
            kind=row.get("kind") or "add",
            line_id=str(row.get("line_id") or ""),
            text=(row.get("text") or "").strip(),
            prev=row.get("prev") or None,
        )


@dataclass(frozen=True)
class Order:
    said: str = ""
    lines: list[OrderLine] = field(default_factory=list)
    log: list[LogEntry] = field(default_factory=list)
    updated_at: str | None = None
    last_run_at: str | None = None
    last_ticket_id: str | None = None

    def find(self, line_id: str) -> OrderLine | None:
        return next((line for line in self.lines if line.id == line_id), None)

    def kept(self) -> list[OrderLine]:
        return [line for line in self.lines if line.status == "kept"]

    def to_dict(self) -> dict[str, Any]:
        return {
            "said": self.said,
            "lines": [line.to_dict() for line in self.lines],
            "log": [entry.to_dict() for entry in self.log],
            "updated_at": self.updated_at,
            "last_run_at": self.last_run_at,
        }

    @staticmethod
    def from_dict(row: dict[str, Any] | None) -> "Order":
        row = row or {}
        return Order(
            said=(row.get("said") or "").strip(),
            lines=[OrderLine.from_dict(entry) for entry in (row.get("lines") or [])],
            log=[LogEntry.from_dict(entry) for entry in (row.get("log") or [])],
            updated_at=row.get("updated_at"),
            last_run_at=row.get("last_run_at"),
            last_ticket_id=row.get("last_ticket_id"),
        )


def new_id() -> str:
    return uuid.uuid4().hex


def replace_said(order: Order, said: str) -> Order:
    """Screen 1's answer, stored verbatim. Whitespace is collapsed and nothing
    else — the brief re-states the user's own words, so trimming them here would
    mean the contract line quotes something they never wrote."""
    return replace(order, said=" ".join(said.split()))


# ── operations ───────────────────────────────────────────────────────────────


def _swap(order: Order, line: OrderLine) -> Order:
    return replace(order, lines=[line if x.id == line.id else x for x in order.lines])


def _logged(order: Order, entry: LogEntry) -> Order:
    return replace(order, log=[*order.log, entry])


def keep(order: Order, line_id: str, *, now: str) -> tuple[Order, LogEntry | None]:
    """Say yes. Refused on an `unusable` line — Myro cannot run it, so a yes
    there would be a promise it can't keep. Reword it first (which clears the
    flag) or drop it."""
    line = order.find(line_id)
    if line is None or line.unusable:
        return order, None
    entry = LogEntry(id=new_id(), kind="keep", line_id=line.id, text=line.text, prev=line.to_dict())
    return _logged(_swap(order, replace(line, status="kept", answered_at=now)), entry), entry


def drop(order: Order, line_id: str, *, now: str) -> tuple[Order, LogEntry | None]:
    line = order.find(line_id)
    if line is None:
        return order, None
    entry = LogEntry(id=new_id(), kind="drop", line_id=line.id, text=line.text, prev=line.to_dict())
    return _logged(_swap(order, replace(line, status="dropped", answered_at=now)), entry), entry


def unanswer(order: Order, line_id: str) -> tuple[Order, LogEntry | None]:
    """`undo` on an inline answer — back to unanswered, not to the other answer."""
    line = order.find(line_id)
    if line is None:
        return order, None
    return _swap(order, replace(line, status="unanswered", answered_at=None)), None


def reword(order: Order, line_id: str, text: str, *, now: str) -> tuple[Order, LogEntry | None]:
    """Saving a reword COUNTS AS YES, and the line is `user_reworded` forever —
    the note on screen says so, and `original_text` keeps the audit trail. A
    reworded line is by definition usable again: the user just wrote it."""
    line = order.find(line_id)
    text = " ".join(text.split()).rstrip(".")
    if line is None or not text:
        return order, None
    entry = LogEntry(id=new_id(), kind="reword", line_id=line.id, text=text, prev=line.to_dict())
    next_line = replace(
        line,
        text=text,
        original_text=line.original_text or line.text,
        source="user_reworded",
        source_note="reworded by you — this is what Myro runs",
        status="kept",
        unusable=False,
        soft=False,
        answered_at=now,
    )
    return _logged(_swap(order, next_line), entry), entry


def add(
    order: Order,
    *,
    kind: LineKind,
    text: str,
    source: LineSource = "user_said",
    origin: LineOrigin = "preflight",
    source_note: str | None = None,
    status: LineStatus = "kept",
    soft: bool = False,
    unusable: bool = False,
    ref: str | None = None,
) -> tuple[Order, LogEntry | None]:
    text = " ".join(text.split()).rstrip(".")
    if not text:
        return order, None
    line = OrderLine(
        id=new_id(), kind=kind, text=text, source=source, origin=origin,
        source_note=source_note, status=status, soft=soft, unusable=unusable, ref=ref,
    )
    entry = LogEntry(id=new_id(), kind="add", line_id=line.id, text=line.text, prev=None)
    return _logged(replace(order, lines=[*order.lines, line]), entry), entry


def undo(order: Order, entry_id: str) -> Order:
    """Reverse one log entry and forget it. An `add` is removed outright; every
    other kind restores `prev` wholesale, so a line the user had merely not
    answered goes back to unanswered rather than to some default."""
    entry = next((e for e in order.log if e.id == entry_id), None)
    if entry is None:
        return order
    remaining = [e for e in order.log if e.id != entry_id]
    if entry.kind == "add":
        return replace(order, lines=[x for x in order.lines if x.id != entry.line_id], log=remaining)
    if entry.prev is None:
        return replace(order, log=remaining)
    restored = OrderLine.from_dict(entry.prev)
    return replace(order, lines=[restored if x.id == restored.id else x for x in order.lines], log=remaining)


def drop_unanswered(order: Order) -> Order:
    """Run-time enforcement of the contract on the review screen: *Myro runs on
    the N lines above and nothing else.* Called server-side immediately before
    dispatch, so a client that forgets cannot widen the run."""
    return replace(
        order,
        lines=[replace(x, status="dropped") if x.status == "unanswered" else x for x in order.lines],
    )


def merge_imports(order: Order, candidates: list[OrderLine]) -> Order:
    """Fold freshly-imported guesses into a stored order.

    Answers win: a line the user already answered keeps its status and its text,
    whatever the store now says. Only genuinely new refs are appended, and an
    UNANSWERED import whose source fact has since disappeared is removed —
    Myro should not keep asking about a note the user deleted. Answered lines
    stay regardless: once you have judged a line it is yours, not the store's.
    """
    by_ref = {line.ref: line for line in order.lines if line.ref}
    seen_refs = {c.ref for c in candidates if c.ref}

    kept: list[OrderLine] = []
    for line in order.lines:
        if line.ref and line.ref.startswith(("mem:", "profile:")) and line.ref not in seen_refs:
            if line.status == "unanswered":
                continue  # the note behind this guess is gone; stop asking
        kept.append(line)

    fresh = [c for c in candidates if not c.ref or c.ref not in by_ref]
    return replace(order, lines=[*kept, *fresh])


def is_guess(line: OrderLine) -> bool:
    """A line the user has to answer, as opposed to one they set themselves.

    Membership is decided by ORIGIN, not by source: an imported line stays a
    guess after the user rewords it (source flips to `user_reworded`), and it
    stays in its round after they answer it — the tally reads `answered / total`,
    so a round that shed its answers would count down to `0 / 0`.
    """
    return line.origin in ("memory_import", "cv_import") and line.kind in ROUND_OF_KIND


def rounds(order: Order) -> list[dict[str, Any]]:
    """The three confirm rounds, in order. An empty round is omitted, so a user
    with no leanings sees two rounds and a tally that says two."""
    grouped: dict[str, list[str]] = {key: [] for key in ROUND_ORDER}
    for line in order.lines:
        if is_guess(line):
            grouped[ROUND_OF_KIND[line.kind]].append(line.id)
    return [{"key": key, "line_ids": grouped[key]} for key in ROUND_ORDER if grouped[key]]
