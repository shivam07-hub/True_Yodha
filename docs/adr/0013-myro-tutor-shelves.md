# Myro Tutor Is One Agent Over Pluggable, Authored Knowledge Shelves

**Status:** Accepted
**Date:** 2026-06-05
**Related:** ADR-0005 (what Myro is not), MYRO_TUTOR_DESIGN.md, ADR-0014, ADR-0016

## Decision

Myro Tutor is a **single unified career agent** — one brain, many tools — not a set of separate
bots. Its expertise is organised as **pluggable knowledge shelves**, each a versioned,
market-updated **Myro Playbook** that we **author and distill ourselves** (our IP). Launch
shelves: CV, Interview, Strategy, Pedagogy. Myrology (the existing ₹499 feature) drops in later
as shelf 5 through the same seam.

The corpus is **RAG-grounded, never fine-tuned**. A new playbook is citable the day it ships,
and Myro quotes its source rather than asserting unsourced authority.

This satisfies ADR-0005 item 4: Myro is not a generic AI rewriter — the shelves are what let it
explain *why* a CV is or isn't ready, with provenance.

## Considered Options

- **Two separate bots (Tutor + CV Coach):** rejected — fragments memory and the career graph,
  and loses the holistic insight where CV critique and skill tutoring reinforce each other.
- **CV-only tool now, tutoring later:** rejected — undersells the wedge-to-expansion arc; the
  shelf seam is cheap to build once and is the actual moat.
- **Ingest full copyrighted books into the corpus:** rejected — legal/reputational risk for a
  consumer product; not citable cleanly; not our IP.
- **Fine-tune a model on career content:** rejected — we route across hosted OpenRouter tiers we
  cannot fine-tune; bakes knowledge in statically; goes stale; cannot cite.
- **One agent over authored, pluggable shelves (RAG):** accepted — extensible (Myrology = shelf
  5), citable, continuously updatable, and ours.
