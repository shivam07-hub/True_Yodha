# DO NOT EDIT BY HAND

Files in `issues/` are synced from `Myro Newsletter/issues/` via `scripts/sync-newsletter.ts`.

Manual edits to this directory will be overwritten on next sync and will fail the CI parity check.

To publish a new issue:
1. Edit/create MDX in `Myro Newsletter/issues/`
2. Run `pnpm newsletter:sync` from the frontend directory
3. Commit both `Myro Newsletter/issues/` and `frontend/content/newsletter/issues/`
