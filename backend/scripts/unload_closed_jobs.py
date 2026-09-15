#!/usr/bin/env python3
"""Archive due closed listings to disk, then delete those ids.

From backend/ with the venv and .env loaded:
    JOB_UNLOAD_ARCHIVE_DIR=/absolute/path python -m scripts.unload_closed_jobs
"""
from __future__ import annotations

import os
import time
from pathlib import Path

from app.config import settings
from app.services.job_unload_archive import archive_then_retire
from supabase import create_client
from supabase.lib.client_options import ClientOptions


def main() -> None:
    raw = os.getenv("JOB_UNLOAD_ARCHIVE_DIR")
    if not raw:
        raise SystemExit("set JOB_UNLOAD_ARCHIVE_DIR to a real directory")
    root = Path(raw).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    # The app client caps reads at 8s. Closed-row listing + JD fetch and
    # retire_closed_jobs need more than that on Nano.
    db = create_client(
        settings.supabase_url,
        settings.supabase_service_key,
        ClientOptions(postgrest_client_timeout=120),
    )
    total = 0
    batch_size = int(os.getenv("JOB_UNLOAD_BATCH", "50"))
    while True:
        deleted = 0
        for attempt in range(1, 4):
            try:
                deleted = archive_then_retire(db, limit=batch_size, local_root=root)
                break
            except Exception as exc:
                print(f"retry={attempt} err={type(exc).__name__}: {exc}", flush=True)
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        total += deleted
        print(f"batch={deleted} total={total} dir={root}", flush=True)
        if deleted == 0:
            break
    print(f"done total={total}")


if __name__ == "__main__":
    main()
