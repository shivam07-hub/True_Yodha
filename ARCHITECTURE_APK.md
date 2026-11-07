# #61 — Myro on Android

**Architecture spec. Phase 1 by Cursor, next. Written 2026-11-03 from Shivam's grill.**

The app is a Trusted Web Activity (TWA): Chrome showing `www.himyro.com` full
screen, installed from Play. No React rewrite (Path A, chosen 2026-07-23). This
spec makes the site behave like an app inside it and gets the first `.aab` through
Google. Each slice is its own commit on `Develop`, six gates green, plus
`npm run qa:mobile`.

## Decisions (Shivam, 2026-11-03)

| Fork | Decision |
|---|---|
| Play account | Company account (Myro Career Intelligence Pvt Ltd), so D-U-N-S first. No 12-tester rule. |
| Signing key | New upload key. July's key sat in a temporary folder; nothing was ever uploaded, so a new one costs nothing. |
| Payments | Google Play billing, not Razorpay, inside the app. |
| Order | Version 1 ships with buying hidden. Billing is Phase 2, the next update. |
| What the app sells | The ₹199 Apply Pack only. Everything else stays web-only. |
| Price | ₹199 in the app too, the same as the web. |
| #56 | Stays 4th in Cursor's order. Phase 2 starts the day #56's settlement and catalogue reach `main`. |
| First open, logged out | Account creation (`/signup`), with no jobs skeleton first. |
| Myrology | Hidden in the app until billing can sell it. Web unchanged. |
| Real-phone gate | Shivam plus 3 golden-list users on Play's internal-test track, before production. |
| Name and ID | Home screen "Myro", store "Myro — Career Intelligence", ID `com.himyro.app`. |

## Already true (verified 2026-11-03)

- `www.himyro.com` serves `manifest.webmanifest` (`start_url` `/market`),
  `sw.js` and `/.well-known/assetlinks.json` with status 200. The bare domain
  answers 307 to `www`, so every app URL uses `www`.
- Google's Digital Asset Links API returns `com.himyro.app` for
  `https://www.himyro.com`, but with July's upload key (`DD:11:DD:…`). That key
  is replaced in S9.
- `android-twa/twa-manifest.json` is a hand-written Bubblewrap config. Bubblewrap's
  `init` wizard breaks under non-interactive stdin, so don't use it.
- In-app account deletion exists (`AccountDeletionPanel` in `settings-modal.tsx`,
  `delete_account` in `routers/users.py`). Play also wants a web link: S8.
- Live sale surfaces, every caller of `billing.createOrder` or
  `startEngagementCheckout`:
  - `app/(authed)/filing/page.tsx` (₹599)
  - `app/(authed)/job-switch-plan/page.tsx` (engagement subscription)
  - `app/myrology/checkout.tsx` (₹299)
  - `components/preparations/audit-room.tsx` (₹999)
  - `components/settings-modal.tsx` (the coin launch pack)
- Nobody needs to buy today: 0 paid top-ups ever, and the median balance is 3,000
  coins across 1,087 real people (2026-11-02).
- Nobody has used Myro signed in on a real phone. `qa:mobile` and `/dev/phone` are
  emulation.

---

## Phase 1 — the app, buying hidden (Cursor, now)

### S1 · One signal: "am I inside the app?"

`frontend/lib/platform/app-shell.ts` exports `isAndroidApp(): boolean`.
`useIsAndroidApp()` lives in `use-android-app.ts`: the reader is imported by
`lib/api.ts`, and server routes import that file, so the hook cannot sit in
the same module. Nothing else may sniff the user agent or the referrer.

- **Signals:** the TWA start URL carries `?shell=android` (S9 sets it), or
  `document.referrer` starts with `android-app://com.himyro.app`, which Android
  sets when the app opens a link.
- **Storage:** `sessionStorage` only, read in a try/catch. **Never `localStorage`
  or a cookie:** a TWA shares Chrome's cookies and storage with the browser on the
  same phone, so a stored flag would hide buying in that person's ordinary Chrome
  tabs too.
- **Measurement:** client telemetry and `core_loop_events` carry the shell
  (`web` | `android`), so `loop_reach.py` can count app users on the loop. This is
  an additive column; apply the migration before pushing the code that writes it.

**Done when** unit tests show the query signal and the referrer signal each read
`true`, a plain browser tab reads `false`, and a reload inside the same session
still reads `true`. Met by `frontend/tests/app-shell.test.ts`.

**Built 2026-11-05.** `frontend/lib/platform/app-shell.ts` is the only reader of
the referrer. Beacons send `shell` (`web` | `android`) on
`POST /v1/telemetry/loop-step`, and `loop_reach.py` counts "in the Android app".
The column is `database/migrations/20261105193000_core_loop_shell.sql`, applied
2026-11-07. A read of `core_loop_events.shell` returns 200. The writer is
`b5fc6def` on `Develop`.

### S2 · No buying anywhere in the app

Inside the app, every sale surface above renders nothing.

- A surface whose only job is the sale (`/filing`, `/job-switch-plan`, the audit
  room's purchase, `/myrology/checkout`) is not linked in the app. Opened directly,
  it goes to `/market`.
- No price, and no "buy on the website" anywhere. Google forbids pointing app users
  to outside payment.
- Coins still spend, and the balance still shows.
- Design over words (CLAUDE.md): the control is absent. Nothing explains why.

**Done when** a source-reading contract test (repo style, `npm test`) fails if any
file that calls `billing.createOrder`, `startEngagementCheckout` or `loadRazorpay`
does not read `isAndroidApp`, so a sixth sale surface cannot appear unguarded. In
emulation at 375px, no ₹ price and no Razorpay script appear on any authed surface
with `?shell=android`.

### S3 · Myrology is absent from the app

Hide every link to it in the app:

- `lib/nav-items.ts:106`
- `mobile/redesign/profile-surface.tsx:73`
- `components/cv/builder/persona-canvas.tsx:242`
- `components/shell/authed-top-strip.tsx` (tablet widths)
- the footer built from `lib/site-routes.ts`

`/myrology/*` opened inside the app goes to `/market`.

**Done when** `qa:mobile` with the app signal finds no Myrology link, and the web
is unchanged.

### S4 · First open, logged out: create an account

Inside the app, the auth gate sends a person without a session to `/signup`,
which already links to Sign in, instead of `/login`. Change
`loginRedirectTarget()` in `lib/hooks/use-auth.ts`. In the app, `/market` must
not paint the jobs skeleton when there is no session; today it shows one for a few
seconds, then lands on "Welcome back". A signed-in person still opens on Jobs. The
web is unchanged.

**Done when** a cold open logged out with `?shell=android` shows `/signup` as its
first painted screen.

### S5 · Phone edits land on the CV that is open

**Closed 2026-11-04** with #58 S5 (`4b9be63d`). It was the APK blocker: the phone
editor wrote every CV through `useMasterAutosave`, so a tailored CV changed the
master. `/cv?jobId=` now opens the mobile editor, and that editor saves through
`useJobDraftAutosave`. The Main CV still uses `useMasterAutosave`.

**Done when** a test opens a tailored CV in the mobile editor, adds a role, and
finds the role on that tailored version with the master unchanged. Met by
`frontend/tests/cv-add-role.test.ts`.

### S6 · Phone onboarding (BACKLOG FD7)

- `components/onboarding/journey-progress.tsx` hides step labels under `sm`, so a
  phone sees bare "1" and "2". Show the labels.
- `app/onboarding/page.tsx` treats a failed onboarding-state call like "no CV yet"
  and invites a person who has a CV to upload again. Show the failure with a retry.

**Done when** both show correctly at 375px, with the failed call simulated.

### S7 · Phone Fixes queue (cut first if S1–S6 run long)

The copied-list-marker cleanup (`d197a058`) is offered only in the desktop
editor's Fixes queue, so a phone-only person is never offered it. Offer the same
row on the phone.

### S8 · A web link for deleting an account

Play requires a web page where people can ask for deletion without the app. Add
a public `/account/delete` page:

- It says what is deleted and how.
- Signed in, it opens the existing Account deletion panel.
- Signed out, it goes to sign in and comes back.

Link it from `/privacy`, and add it to `site-routes.ts` so `check:reach` passes.

### S9 · The wrapper

- `android-twa/twa-manifest.json`: `startUrl` → `/market?shell=android`, the new
  upload-key fingerprint, and `appVersionCode` bumped. Use Bubblewrap's current
  target SDK, which must meet Play's target-API rule on the day of upload.
- `frontend/public/.well-known/assetlinks.json`: the new upload-key SHA-256.
  After the first upload, add **Play's app-signing** SHA-256 as well (Play Console
  → App integrity). Play re-signs the app, and without that line the app shows
  Chrome's URL bar.
- Rewrite `android-twa/README.md`: drop the July keystore lines and add the steps
  below.

**Done when** Google's Digital Asset Links API
(`digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.himyro.com&relation=delegate_permission/common.handle_all_urls`)
returns both fingerprints for `com.himyro.app`.

### Out of scope for Phase 1

- Push notifications (FCM): after install is live, as decided 2026-07-23.
- The Expo native app (Path B).
- `/jobs/feed` latency (p95 over 8s, BACKLOG R3): another session owns that read
  path. The phone gate will feel it, so read R3 before production.

---

## Phase 2 — Play billing for the Apply Pack (starts when #56 lands)

Starts the day #56's settlement and catalogue (`billing_catalogue`, the claim)
are on `main`. One product, `apply_pack`: one-time, consumable, ₹199.

- **B1:** `twa-manifest.json` sets `features.playBilling.enabled: true`. Rebuild.
- **B2:** in the app, the Apply Pack button, rendered from `GET /api/catalogue`
  like the web, pays through the Digital Goods API plus `PaymentRequest` with
  `https://play.google.com/billing`. Razorpay never loads in the app, and every
  other product stays hidden.
- **B3:** `POST /billing/play/verify {product_id, purchase_token}`.
  1. Call the Play Developer API (`purchases.products.get`) with a service
     account.
  2. A valid, unconsumed purchase goes into #56's settlement claim:
     compare-and-set, unique on the purchase token, the same grant (500 coins + 1
     Human Check) and the same ledger rows as a Razorpay sale.
  3. Consume the purchase.

  A retry or a duplicate never grants twice: charging needs a claim plus a client
  guard (memory: reliability signals).
- **B4:** refunds come from a daily read of Play's Voided Purchases API into #56's
  refund path.
- **B5:** test only with Play license testers on the internal track, never real
  money.

**Done when** a license tester on a real phone buys once and gets 500 coins plus 1
Human Check once; a second verify call with the same token grants nothing; a
voided purchase reverses the grant.

---

## Shivam's hands, in order

1. **D-U-N-S** for Myro Career Intelligence Pvt Ltd, then a **Play Console
   company account** ($25 once). Start now; it is the longest wait.
2. **New upload key.** Install Java 17 first; this Mac has none:
   ```bash
   brew install openjdk@17
   ```
   Then:
   ```bash
   keytool -genkeypair -v -keystore ~/myro-upload.keystore -alias himyro-upload -keyalg RSA -keysize 2048 -validity 9125 -storetype PKCS12
   ```
   Pick a password and keep it, with the file, in a password manager. Send the
   agent the `SHA256:` line from
   `keytool -list -v -keystore ~/myro-upload.keystore -alias himyro-upload`.
   The fingerprint is public; the file and the password are not.
3. After S1–S9 are on `main`, **build**: `cd android-twa`, copy the keystore in as
   `android.keystore`, run `npx @bubblewrap/cli build`, and type the password.
   Upload the `.aab` to **internal testing**. Send the agent Play's app-signing
   SHA-256.
4. **The phone gate:** you plus 3 golden-list users, from the internal-test link.
5. **Store listing:** screenshots, description, privacy URL (`/privacy`), deletion
   URL (`/account/delete`), data-safety form, content rating. Then production.
6. **Phase 2:** create `apply_pack` at ₹199 in Play Console, and a service account
   with Play Developer API access, its key set on Railway by you.

## The phone gate (before production)

From the internal-test install, on mobile data:

- Sign in with Google, LinkedIn and email link.
- Upload a CV (the #1 funnel action), tailor it, and download the PDF.
- Apply opens the company's page, and Back returns to the app.
- No price and no Myrology anywhere.
- Delete a test account.
- Offline shows the offline page.
- No Chrome URL bar: the asset links are verified.

A failure becomes a BACKLOG item with evidence. Production waits until every item
passes.

## How we will know it worked

- `loop_reach.py` splits the loop by shell (S1). The north star counts
  applications sent from the app.
- #61 Phase 1 closes when the app is live on Play production and one real user has
  gone from upload to download inside it.
