"""LinkedIn connections CSV parsing — tolerant of the export preamble."""
from __future__ import annotations

from app.services.connections_import import format_warm_connection, parse_connections_csv

# Real LinkedIn export shape: a "Notes:" preamble + blank line, then the header.
LINKEDIN_EXPORT = b"""Notes:
"When exporting your connection data, you may notice..."

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Asha,Rao,https://linkedin.com/in/asha,,Netscribes,Director Analytics,15 Jun 2024
Ravi,Kumar,https://linkedin.com/in/ravi,ravi@x.com,Tata Play,Product Manager,01 Jan 2023
,,,,NoName Co,Analyst,02 Feb 2023
"""


def test_parses_after_preamble_and_builds_full_name():
    rows = parse_connections_csv(LINKEDIN_EXPORT)
    assert len(rows) == 2  # the nameless row is dropped
    assert rows[0]["full_name"] == "Asha Rao"
    assert rows[0]["company"] == "Netscribes"
    assert rows[0]["position"] == "Director Analytics"


def test_drops_email_and_url_columns():
    rows = parse_connections_csv(LINKEDIN_EXPORT)
    # We keep only name/company/position/connected_on — never email or URL.
    assert set(rows[0].keys()) == {"full_name", "company", "position", "connected_on"}


def test_header_without_preamble_still_parses():
    csv = b"First Name,Last Name,Company,Position,Connected On\nJo,Lin,Acme,Lead,2024\n"
    rows = parse_connections_csv(csv)
    assert rows == [
        {"full_name": "Jo Lin", "company": "Acme", "position": "Lead", "connected_on": "2024"}
    ]


def test_garbage_returns_empty():
    assert parse_connections_csv(b"not a csv at all") == []
    assert parse_connections_csv(b"") == []


def test_utf8_bom_and_names_survive():
    csv = "﻿First Name,Last Name,Company,Position,Connected On\nÉlodie,Barré,Café Co,Chef,2024\n".encode("utf-8")
    rows = parse_connections_csv(csv)
    assert rows[0]["full_name"] == "Élodie Barré"


def test_format_warm_connection():
    assert format_warm_connection({"full_name": "Asha Rao", "position": "Director"}) == "Asha Rao — Director"
    assert format_warm_connection({"full_name": "Asha Rao", "position": ""}) == "Asha Rao"
