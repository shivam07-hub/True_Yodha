"""Parse a LinkedIn 'Connections.csv' export into warm-intro rows.

The export has a short preamble ("Notes:" + a blank line) before the real
header: `First Name,Last Name,URL,Email Address,Company,Position,Connected On`.
We keep only what a warm-intro suggestion needs — name, company, position — and
deliberately drop the email + profile URL (we don't need stranger contact data).
Pure + deterministic; no network.
"""
from __future__ import annotations

import csv

_MAX_ROWS = 10_000
_HEADER_HINT = "first name"


def parse_connections_csv(raw: bytes) -> list[dict]:
    """Return [{full_name, company, position, connected_on}] from the export.

    Skips the LinkedIn preamble, tolerates missing columns, drops rows with no
    usable name. Caps at _MAX_ROWS to bound a pathological upload.
    """
    text = raw.decode("utf-8-sig", errors="replace")
    lines = text.splitlines()

    # Find the real header row (LinkedIn puts a "Notes:" preamble above it).
    header_idx = None
    for i, line in enumerate(lines):
        if _HEADER_HINT in line.lower() and "company" in line.lower():
            header_idx = i
            break
    if header_idx is None:
        return []

    reader = csv.DictReader(lines[header_idx:])
    rows: list[dict] = []
    for row in reader:
        norm = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        first = norm.get("first name", "")
        last = norm.get("last name", "")
        full_name = " ".join(p for p in (first, last) if p).strip()
        if not full_name:
            continue
        rows.append(
            {
                "full_name": full_name,
                "company": norm.get("company", "") or None,
                "position": norm.get("position", "") or None,
                "connected_on": norm.get("connected on", "") or None,
            }
        )
        if len(rows) >= _MAX_ROWS:
            break
    return rows


def looks_like_connections_csv(raw: bytes) -> bool:
    """Cheap header sniff: is this a LinkedIn Connections.csv export? Scans the
    first few lines (the export has a "Notes:" preamble above the header)."""
    try:
        head = raw[:4096].decode("utf-8-sig", errors="replace")
    except Exception:  # noqa: BLE001 — undecodable bytes are simply not a connections CSV
        return False
    for line in head.splitlines()[:10]:
        lower = line.lower()
        if _HEADER_HINT in lower and "company" in lower and "connected on" in lower:
            return True
    return False


def format_warm_connection(row: dict) -> str:
    """A one-line warm-intro descriptor for the reach pack prompt."""
    name = (row.get("full_name") or "").strip()
    position = (row.get("position") or "").strip()
    return f"{name} — {position}" if position else name
