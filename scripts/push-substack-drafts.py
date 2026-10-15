#!/usr/bin/env python3
"""Push synced Myro newsletter issues to Substack as drafts.

Reads SUBSTACK_PUBLICATION_URL and SUBSTACK_SID from the environment
(backend/.env or the repo .env). Does not publish and does not email.
See newsletter_substack for the full contract.

    backend/.venv/bin/python scripts/push-substack-drafts.py --all --dry-run
    backend/.venv/bin/python scripts/push-substack-drafts.py --slug <slug>
    backend/.venv/bin/python scripts/push-substack-drafts.py --all
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from newsletter_substack.cli import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
