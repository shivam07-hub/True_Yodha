"""The golden-list digest, by hand (#59).

The schedule calls `POST /internal/golden-digest/send` from pg_cron, on
production. This is the operator's door to the same `send_due`: a dry run prints
what each member would get and writes nothing; `--preview-to` sends every
member's digest to one inbox; `--apply` is the real send. The last two need
RESEND_API_KEY and MYRO_ANALYTICS_REFRESH_SECRET in the environment — run them
where production's are (`railway run`), never from a laptop .env without them.

Usage:
    python -m scripts.golden_digest                       # dry run
    python -m scripts.golden_digest --preview-to you@x.com
    python -m scripts.golden_digest --apply --api-base-url https://api.himyro.com
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone

from app.config import settings
from app.database import get_supabase_admin
from app.services import golden_digest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="send for real and record each send")
    parser.add_argument("--preview-to", help="send every member's digest to this inbox; write nothing")
    parser.add_argument("--api-base-url", help="the API's public origin, for List-Unsubscribe")
    parser.add_argument("--app-url", default=settings.public_app_url or "https://himyro.com")
    args = parser.parse_args(argv)

    report = golden_digest.send_due(
        datetime.now(timezone.utc),
        store=golden_digest.SupabaseStore(get_supabase_admin()),
        mailer=golden_digest.ResendMailer(),
        apply=args.apply,
        app_url=args.app_url.rstrip("/"),
        api_url=(args.api_base_url or "").rstrip("/") or None,
        preview_to=args.preview_to,
    )
    for user_id, subject, text in report.previews:
        print(f"── {user_id} · {subject}\n{text}\n")
    print(
        f"considered={report.considered} sent={report.sent} failed={report.failed} "
        f"skipped={report.skipped} mode={'apply' if args.apply else 'preview' if args.preview_to else 'dry-run'}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
