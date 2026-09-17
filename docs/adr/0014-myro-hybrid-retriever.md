# Myro Grounds On A Hybrid Retriever, Not A General RAG Engine

**Status:** Accepted
**Date:** 2026-06-05
**Related:** ADR-0013, MYRO_TUTOR_DESIGN.md

> **Renamed 2026-09-17.** "Myro Tutor" is **Myro Mentor**: `services/mentor.py`,
> `mentor_grounding.py`, `mentor_retriever.py`, `mentor_learn.py`, and the live
> design doc [MYRO_MENTOR.md](../../MYRO_MENTOR.md) at the repo root. The word
> "tutor" appears nowhere in the code. `MYRO_TUTOR_DESIGN.md`, cited below as
> Related, does not exist and has not for some time — the decision stands, its
> pointer did not.


## Decision

Myro uses a **hybrid retriever**, not a LlamaIndex/graph-RAG stack:

- **Personal layer** — deterministic **context assembly via SQL** over the existing career graph
  (CV versions, target JD, skill gaps, Mirror Score, diary/XP). The user's own structured data
  is `SELECT`-ed, never embedded.
- **Curated layer** — **pgvector** over the authored playbook corpus, embedded **offline at
  publish time** (near-zero runtime cost).

New infra is limited to the `pgvector` extension on Supabase plus one embeddings function.

## Considered Options

- **LlamaIndex end-to-end (DeepTutor's choice):** rejected — justified only for ingesting
  *arbitrary user PDFs at scale*, which we do not do; adds an indexing/versioning ops surface for
  no benefit at playbook scale.
- **Vector-search the user's own data too:** rejected — throws away fidelity and adds latency to
  retrieve data we can fetch exactly by key.
- **Hosted vector DB (Pinecone et al.):** rejected — cost + a second datastore; pgvector inside
  the Supabase we already run is sufficient at hundreds-of-chunks scale.
- **Hybrid retriever (SQL personal + pgvector curated):** accepted — highest fidelity on personal
  data, minimal new infra, cheap, and good enough for the small authored corpus.

Revisit only if we ever let users upload their own arbitrary study PDFs into Myro.
