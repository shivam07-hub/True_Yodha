#!/usr/bin/env python3
"""Stdio MCP for Myro newsletter Substack drafts.

    backend/.venv/bin/python scripts/newsletter-substack-mcp.py

Tools: push_issue_draft, get_draft, publish_draft.
The session cookie stays in SUBSTACK_SID. This process does not log it.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from newsletter_substack.mcp_server import serve  # noqa: E402

if __name__ == "__main__":
    serve()
