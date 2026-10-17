"""CLI for pushing synced newsletter issues to Substack as drafts.

    backend/.venv/bin/python scripts/push-substack-drafts.py --slug <slug>
    backend/.venv/bin/python scripts/push-substack-drafts.py --all
    backend/.venv/bin/python scripts/push-substack-drafts.py --all --dry-run

``--dry-run`` prints the editor document and the intended requests and
does not use the network. A live run needs SUBSTACK_PUBLICATION_URL and
SUBSTACK_SID. See newsletter_substack.__doc__.
"""

from __future__ import annotations

import argparse
import json
import sys

from newsletter_substack.client import RefusedPublication, SubstackClient, SubstackError
from newsletter_substack.publish import (
    ENV_HELP,
    MissingCredentials,
    PushResult,
    credentials_from_env,
    credentials_status,
    load_env_files,
    push_all,
    push_slug,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Push newsletter issues to Substack drafts.")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--slug", help="One synced issue slug.")
    target.add_argument("--all", action="store_true", help="Every synced issue.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the document and intended requests. Do not call Substack.",
    )
    args = parser.parse_args(argv)
    load_env_files()
    try:
        results = _run(args.slug, all_issues=args.all, dry_run=args.dry_run)
    except MissingCredentials as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except (RefusedPublication, SubstackError, ValueError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    for result in results:
        print(_format(result))
    return 0


def _run(slug: str | None, *, all_issues: bool, dry_run: bool) -> list[PushResult]:
    if dry_run:
        if slug:
            return [push_slug(slug, dry_run=True)]
        return push_all(dry_run=True)
    creds = credentials_from_env()
    if creds is None:
        print(credentials_status(), file=sys.stderr)
        raise MissingCredentials(ENV_HELP)
    url, sid = creds
    client = SubstackClient(url, sid)
    try:
        if slug:
            return [
                push_slug(slug, dry_run=False, publication_url=url, client=client)
            ]
        return push_all(dry_run=False, publication_url=url, client=client)
    finally:
        client.close()


def _format(result: PushResult) -> str:
    if result.dry_run:
        return json.dumps(
            {
                "slug": result.slug,
                "dry_run": True,
                "created": False,
                "canonical_url": result.canonical_url,
                "chart": result.chart,
                "chart_path": result.chart_path,
                "chart_missing": result.chart_path is None,
                "email_send": False,
                "document": result.document,
                "requests": result.requests,
            }
        )
    return (
        f"{result.slug}\t{result.editor_url}\t"
        f"draft_id={result.draft_id}\tchart={result.chart}\t"
        f"created={str(result.created).lower()}"
    )


if __name__ == "__main__":
    raise SystemExit(main())
