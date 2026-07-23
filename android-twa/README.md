# Myro Android TWA — build runbook

Trusted Web Activity wrapper of the PWA (himyro.com), for Play Store. Path A
per CLAUDE.md backlog #9 (TWA over full native rewrite).

## State (2026-07-23)

- `manifest.webmanifest`, service worker, offline shell, maskable icon —
  live on `main` (himyro.com), verified reachable.
- `frontend/public/.well-known/assetlinks.json` — **filled with the real
  upload-key SHA-256**, committed. Verify live at
  `https://www.himyro.com/.well-known/assetlinks.json` after this reaches
  `main` (currently on `Develop` only — needs the usual main merge).
- `twa-manifest.json` (this dir) — hand-authored bubblewrap config, derived
  from the live manifest. `bubblewrap init`'s interactive wizard is broken
  under piped/non-tty stdin on Node 24 (inquirer `ERR_USE_AFTER_CLOSE`) —
  don't fight it, this file replaces what `init` would have generated.
- **Upload keystore generated via `keytool` directly** (bypasses the same
  broken wizard). NOT committed here — secrets never go in git.

## ⚠️ Keystore handoff — action needed

Keystore + passwords are sitting in the sandbox scratchpad for this session
only (ephemeral, gets cleaned up):

```
himyro-upload.keystore
himyro-upload.keystore.passwords.txt
```

**Move both to a password manager (1Password/etc) immediately, then delete
the plaintext passwords file.** Details:
- alias: `himyro-upload`
- type: PKCS12, RSA 2048, valid 25y
- SHA-256 (already in assetlinks.json + twa-manifest.json):
  `DD:11:DD:0B:56:2F:47:D8:7F:DD:F8:AC:3D:4E:DB:CD:7E:30:15:FA:F2:F8:7D:98:D0:D3:D4:D7:D4:78:E7:56`

Play Console uses **Play App Signing** — this is only the *upload* key, not
Google's app-signing key. If it's ever lost, Google support can reset it;
it is not the permanent app identity. Lower stakes than a classic keystore,
still don't leak it.

## Remaining steps to a signed `.aab`

1. `main` merge (assetlinks fingerprint must be live before Android will
   trust the TWA — no URL bar fallback).
2. Confirm `https://www.himyro.com/.well-known/assetlinks.json` serves the
   real fingerprint (not the placeholder) once merged + deployed.
3. Somewhere with Android SDK + JDK 17 (this sandbox has JDK only, no SDK —
   full SDK is a multi-GB download not worth doing headless here):
   ```
   cd android-twa
   cp <keystore-from-password-manager> ./android.keystore
   npx @bubblewrap/cli build
   ```
   Reads `twa-manifest.json` in this dir, produces `app-release-bundle.aab`.
4. Real device / authed mobile QA (CLAUDE.md #9 step 2) — do this before
   upload, not after, so bugs don't land in Play reviews.
5. Play Console ($25 one-time) → upload `.aab` → store listing (screenshots,
   description, privacy policy = himyro.com/privacy) → content rating →
   submit.
6. Post-launch: FCM push (`device_tokens` + `/push/register`, v2 prereq #3)
   — the actual retention hook. Not a launch blocker.

## Why manual keytool, not `bubblewrap init`

`@bubblewrap/cli` (current npm version, run via `npx`) opens an inquirer
wizard even for `--version`. Under a piped/non-interactive stdin it throws
`Error [ERR_USE_AFTER_CLOSE]` after the first answer — an inquirer/Node 24
readline incompatibility, not a bubblewrap misconfiguration. `keytool` is
the actual JDK tool bubblewrap's wizard would have shelled out to anyway;
calling it directly with `-dname`/`-storepass`/`-keypass` flags is fully
scriptable and produces an identical PKCS12 keystore.
