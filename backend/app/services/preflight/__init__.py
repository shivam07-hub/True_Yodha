"""Myro pre-flight — one order, two surfaces, modules with narrow contracts.

    lines            pure ops on the order (keep / drop / reword / add / undo)
    memory_import    memory notes + stored profile → typed lines with provenance
    prose            *frontend* (lib/preflight/prose.ts) — both surfaces must
                     render the identical string, so it is one module consumed
                     twice, not two implementations agreeing by luck
    proposals        an utterance or a topic chip → a reviewable diff
    payload          kept lines → the profile patch the run dispatches against
    repository       load / persist; the single source of truth for both surfaces

The router (app/routers/preflight.py) owns HTTP and nothing else.
"""
