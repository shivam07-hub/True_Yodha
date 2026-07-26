# Beta Feedback Closure Ledger

This directory is the machine-checkable closure registry for the beta program.
The canonical beta report remains the narrative synthesis; this ledger prevents
individual feedback rows from disappearing inside that synthesis.

## Refresh

From the repository root:

```bash
PYTHONPATH=backend .venv/bin/python \
  -m scripts.export_beta_feedback_ledger
```

The exporter:

- reads every `intern_beta_assignment_v1` row with explicit pagination;
- excludes `user_id` and confirmation metadata;
- preserves assessment text verbatim except direct email/phone identifiers,
  which become explicit redaction markers;
- keeps attachment feedback separate from Supabase identities;
- preserves human-written closure fields when source evidence is refreshed; and
- fails if a duplicate source identifier or unsupported closure status exists.

Validate the committed file without database credentials:

```bash
PYTHONPATH=backend .venv/bin/python \
  -m scripts.export_beta_feedback_ledger --validate-only
```

## Closure Contract

Allowed statuses are `unverified`, `open`, `partial`, `fixed`, and
`non_actionable`.

`fixed` is rejected unless the entry contains:

- code evidence;
- deployment evidence;
- automated test evidence;
- production metric evidence;
- user validation; and
- a closure date.

Positive, malformed, or non-actionable feedback remains in the ledger. It is
marked `non_actionable` with a reason rather than deleted.
