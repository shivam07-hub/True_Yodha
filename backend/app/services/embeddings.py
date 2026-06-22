"""
Embedding helper for the Mentor retriever ("the librarian") — STEP 2 of 6.

Design: docs/DESIGN_mentor_retriever.md §3. The "rented brain": one pinned hosted
embedding model used for BOTH the offline corpus (publish_playbook.py) and the
runtime query (mentor_retriever.retrieve). Query and corpus MUST share one model
or cosine similarity is meaningless — so this module exposes exactly one model and
fails loudly rather than silently swapping providers (unlike the chat fallback
ladder in llm_provider.py, where any model can answer a prompt).

Model: OpenAI `text-embedding-3-small` via OpenRouter — the same `openrouter_api_key`
+ base already powering the chat ladder in llm_provider.py. One key for everything.
We request `dimensions=768` (text-embedding-3 supports native Matryoshka truncation,
and OpenRouter passes the param through), pinned to the `playbook_chunks.embedding
vector(768)` column. Changing the model OR the dimension requires a full corpus
re-embed (and a schema migration if the dim changes).

Scope: Myro cloud stack. Reuses the ADR-0008 provider budget slot + transient retry
seam from llm_budget so a publish run or a spike cannot fan out past the ceiling.
"""

from __future__ import annotations

import asyncio
import logging

from openai import AsyncOpenAI

from app.config import settings
from app.services import llm_budget

logger = logging.getLogger(__name__)

# Pinned. Must match playbook_chunks.embedding vector(<DIM>).
EMBED_MODEL = "openai/text-embedding-3-small"
EMBED_DIM = 768

# OpenRouter's OpenAI-compatible surface (same base llm_provider.py uses for chat).
_OR_BASE = "https://openrouter.ai/api/v1"
_OR_HEADERS = {"HTTP-Referer": "https://himyro.com", "X-Title": "Myro"}

# Batch larger corpora under this per embeddings call.
_MAX_BATCH = 100

_client: AsyncOpenAI | None = None


class EmbeddingError(Exception):
    """Raised when embeddings cannot be produced or violate the pinned contract."""


def _get_client() -> AsyncOpenAI:
    """Lazily build the singleton embedding client.

    Fails loudly if the rented-brain key is absent — there is deliberately no
    automatic fallback to a different embedding provider, because a corpus
    embedded with model A is not comparable to a query embedded with model B.
    """
    global _client
    if _client is None:
        if not settings.openrouter_api_key:
            raise EmbeddingError(
                "openrouter_api_key is not set — the Mentor retriever embeds via "
                f"OpenRouter ({EMBED_MODEL}). Set it before publishing or retrieving."
            )
        _client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=_OR_BASE,
            default_headers=_OR_HEADERS,
        )
    return _client


async def _embed_batch(batch: list[str]) -> list[list[float]]:
    """Embed one ≤_MAX_BATCH batch, retrying transient failures in place.

    Mirrors llm_provider.complete's retry posture: a global budget slot is held
    per call, and 429 / timeout / 5xx / dropped-connection are retried against the
    same model with backoff before giving up.
    """
    client = _get_client()
    max_retries = int(settings.llm_transient_retries)
    for attempt in range(max_retries + 1):
        try:
            async with llm_budget.provider_slot():
                resp = await client.embeddings.create(
                    model=EMBED_MODEL, input=batch, dimensions=EMBED_DIM
                )
            # Order is not guaranteed by the API contract — sort by index.
            ordered = sorted(resp.data, key=lambda d: d.index)
            vectors = [list(d.embedding) for d in ordered]
            if len(vectors) != len(batch):
                raise EmbeddingError(
                    f"{EMBED_MODEL} returned {len(vectors)} vectors for {len(batch)} inputs"
                )
            for vec in vectors:
                if len(vec) != EMBED_DIM:
                    raise EmbeddingError(
                        f"{EMBED_MODEL} returned a {len(vec)}-dim vector; "
                        f"playbook_chunks pins {EMBED_DIM}. Model/schema mismatch."
                    )
            return vectors
        except EmbeddingError:
            raise  # contract violation is not retryable
        except Exception as exc:
            if llm_budget.is_transient(exc) and attempt < max_retries:
                delay = llm_budget.backoff_delay(attempt, llm_budget.retry_after_seconds(exc))
                logger.warning(
                    "embed transient failure (%s) — retry %d/%d in %.1fs",
                    type(exc).__name__, attempt + 1, max_retries, delay,
                )
                await asyncio.sleep(delay)
                continue
            raise EmbeddingError(f"embedding call failed: {exc}") from exc
    raise EmbeddingError("embedding call exhausted retries")


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts → list of 768-dim vectors, in input order.

    Used by the offline publish pipeline (many chunks) and, via embed_query, by
    the runtime retriever (one query). Batches transparently under the API cap.
    Empty input → empty list (no API call).
    """
    if not texts:
        return []
    out: list[list[float]] = []
    for start in range(0, len(texts), _MAX_BATCH):
        out.extend(await _embed_batch(texts[start : start + _MAX_BATCH]))
    return out


async def embed_query(text: str) -> list[float]:
    """Embed a single query string → one 768-dim vector. Convenience for retrieve()."""
    if not text or not text.strip():
        raise EmbeddingError("cannot embed an empty query")
    vectors = await embed_texts([text])
    return vectors[0]


def to_pgvector(vec: list[float]) -> str:
    """Format a vector as pgvector's text form '[a,b,c]'. PostgREST sends it as a
    string and Postgres casts text -> vector on write / in the match RPC. Shared by
    the publish pipeline (corpus write) and the retriever (query arg)."""
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"
