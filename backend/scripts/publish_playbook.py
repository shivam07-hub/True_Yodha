"""
publish_playbook.py — Mentor retriever STEP 4 (offline publish pipeline).

Design: docs/DESIGN_mentor_retriever.md §5. Reads the chunk JSONL exported by the
rag-sources repo (export_chunks.py, step 3), embeds each NEW/changed chunk with the
pinned model (embeddings.embed_texts), and upserts into Supabase `playbook_chunks`.

ADR-0014: embedding happens OFFLINE at publish time — this is a manual operator
command, never on a user request path. Idempotent on (shelf, content_hash): a
re-run with an unchanged corpus embeds nothing and writes nothing. A republished
playbook (changed text) inserts the new chunks and prunes the source's stale ones,
so retrieval never serves outdated guidance.

Usage (from backend/, with SUPABASE_* + GOOGLE_API_KEY in env):
    python -m scripts.publish_playbook --dry-run     # plan only, no embed, no write
    python -m scripts.publish_playbook               # embed new chunks + upsert + prune
    python -m scripts.publish_playbook --no-prune    # keep stale chunks
    python -m scripts.publish_playbook --chunks /path/to/playbook_chunks.jsonl

The default chunks path points at the local rag-sources export; override with
--chunks or the PLAYBOOK_CHUNKS_PATH env var.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path

from app.database import get_supabase_admin
from app.services import embeddings

_DEFAULT_CHUNKS = (
    "/Users/incognito/firecrawl_Supabase/Interview Prep/RAG Sources/"
    "derived/chunks/playbook_chunks.jsonl"
)
TABLE = "playbook_chunks"


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _load_chunks(path: Path) -> list[dict]:
    if not path.exists():
        raise SystemExit(f"chunks file not found: {path}\n(run export_chunks.py in rag-sources first)")
    chunks: list[dict] = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            c = json.loads(line)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{path}:{i}: bad JSON: {exc}")
        for field in ("chunk_id", "source_id", "shelf", "source_title", "text"):
            if not c.get(field):
                raise SystemExit(f"{path}:{i}: chunk missing required field {field!r}")
        c["content_hash"] = _content_hash(c["text"])
        chunks.append(c)
    if not chunks:
        raise SystemExit(f"{path}: no chunks to publish")
    return chunks


def _existing_hashes(client, source_ids: list[str]) -> set[tuple[str, str]]:
    """Current (shelf, content_hash) pairs in the DB for the published sources."""
    if not source_ids:
        return set()
    rows = (
        client.table(TABLE)
        .select("shelf,content_hash,source_id")
        .in_("source_id", source_ids)
        .execute()
        .data
        or []
    )
    return {(r["shelf"], r["content_hash"]) for r in rows}


async def publish(path: Path, dry_run: bool, prune: bool) -> int:
    chunks = _load_chunks(path)
    client = get_supabase_admin()

    source_ids = sorted({c["source_id"] for c in chunks})
    existing = _existing_hashes(client, source_ids)
    exported_keys = {(c["shelf"], c["content_hash"]) for c in chunks}

    new_chunks = [c for c in chunks if (c["shelf"], c["content_hash"]) not in existing]
    unchanged = len(chunks) - len(new_chunks)
    stale = existing - exported_keys

    by_shelf: dict[str, int] = {}
    for c in chunks:
        by_shelf[c["shelf"]] = by_shelf.get(c["shelf"], 0) + 1

    print(f"chunks file : {path}")
    print(f"sources     : {', '.join(source_ids)}")
    print(f"total       : {len(chunks)}  (shelves={by_shelf})")
    print(f"new/changed : {len(new_chunks)}")
    print(f"unchanged   : {unchanged}")
    print(f"stale (prune {'on' if prune else 'OFF'}): {len(stale)}")

    if dry_run:
        print("\nDRY RUN — no embeddings called, nothing written.")
        return 0

    if new_chunks:
        vectors = await embeddings.embed_texts([c["text"] for c in new_chunks])
        rows = []
        for c, vec in zip(new_chunks, vectors, strict=True):
            redistributable = bool(c.get("redistributable"))
            rows.append({
                "shelf": c["shelf"],
                "source_id": c["source_id"],
                "source_title": c["source_title"],
                "source_url": c.get("source_url") if redistributable else None,
                "chunk_text": c["text"],
                "tags": c.get("tags") or [],
                "token_count": len(c["text"].split()),
                "content_hash": c["content_hash"],
                "embedding": embeddings.to_pgvector(vec),
            })
        client.table(TABLE).upsert(rows, on_conflict="shelf,content_hash").execute()
        print(f"\nupserted {len(rows)} new chunk(s).")
    else:
        print("\nnothing new to embed.")

    if prune and stale:
        for shelf, content_hash in stale:
            client.table(TABLE).delete().eq("shelf", shelf).eq("content_hash", content_hash).execute()
        print(f"pruned {len(stale)} stale chunk(s).")

    total = client.table(TABLE).select("id", count="exact").execute().count
    print(f"playbook_chunks now holds {total} row(s).")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Embed + load authored playbook chunks into Supabase.")
    ap.add_argument(
        "--chunks",
        default=os.environ.get("PLAYBOOK_CHUNKS_PATH", _DEFAULT_CHUNKS),
        help="path to playbook_chunks.jsonl (default: rag-sources export / $PLAYBOOK_CHUNKS_PATH)",
    )
    ap.add_argument("--dry-run", action="store_true", help="plan only; no embed, no write")
    ap.add_argument("--no-prune", dest="prune", action="store_false", help="keep stale chunks")
    args = ap.parse_args(argv)
    try:
        return asyncio.run(publish(Path(args.chunks), dry_run=args.dry_run, prune=args.prune))
    except embeddings.EmbeddingError as exc:
        print(f"ERROR (embedding): {exc.__class__.__name__}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
