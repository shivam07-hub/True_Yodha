#!/usr/bin/env python3
"""Archive due closed listings to disk, then delete those ids.

From backend/ with the venv and .env loaded:
    JOB_UNLOAD_ARCHIVE_DIR=/absolute/path python -m scripts.unload_closed_jobs
"""
from __future__ import annotations

import os
from pathlib import Path

from app.database import get_supabase_admin
from app.services.job_unload_archive import archive_then_retire


def main() -> None:
    raw = os.getenv("JOB_UNLOAD_ARCHIVE_DIR")
    if not raw:
        raise SystemExit("set JOB_UNLOAD_ARCHIVE_DIR to a real directory")
    root = Path(raw).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    db = get_supabase_admin()
    total = 0
    while True:
        deleted = archive_then_retire(db, limit=500, local_root=root)
        total += deleted
        print(f"batch={deleted} total={total} dir={root}", flush=True)
        if deleted == 0:
            break
    print(f"done total={total}")


if __name__ == "__main__":
    main()
