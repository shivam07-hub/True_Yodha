# Payments — one pack, one settlement

**Architecture spec. Written 2026-09-30 from the CEO grill with Shivam; the
LinkedIn check kind added 2026-11-22 (ENG3, ADR-0018).** S1–S2 are built by
Claude, S3–S5 by Cursor. Assessed with `/improve-codebase-architecture`; the UI
slices go through `/frontend-design`.

> **VERIFY IN CODE before building.** Line numbers are from `19781a61`. Each
> numbered slice is its own commit on `Develop`, six gates green. Migrations are
> applied by the agent **before** the code that reads them is pushed, then
> `NOTIFY pgrst, 'reload schema';`.

---

## 1 · The offer (locked 2026-09-30, Shivam — supersedes ENG1)

Myro is a machine that turns your CV into a tailored CV for the job you want and
gets you applying. People pay at two moments inside that machine, and both sell
**the same thing**.

| | |
|---|---|
| **Product** | **Apply Pack** — ₹199, one-time (19900 paise). Bought again when needed. |
| **Contents** | **500 coins** (10 AI-tailored CVs at `CV_WEAVE_XP_COST = 50`) **+ 1 Human Check**, returned **within 24 hours** by a named reviewer. A check is one of two kinds (ENG3): **`cv_job`**, your tailored CV read against one job, or **`linkedin`**, your LinkedIn profile rewritten for you to paste on a short call. |
| **Door 1 · Fuel** | The "Not enough Myro Coins" modal (`XPGateModal`). Today its only action links to `/tokens`, which has no buy button. |
| **Door 2 · Stakes** | "Human check before you apply" on a job's tailored CV (the playground header). The check arrives pre-assigned to that job. |
| **Door 3 · LinkedIn** | On the CV page after the Myro Score. **5,000 coins, or the Apply Pack** with its check spent on LinkedIn. 5,000 sits above `WELCOME_XP` on purpose (0 real users held 5,000 on 2026-11-22). The user gives their `/in/{vanity}` URL and a WhatsApp number. |
| **Retired** | ₹99 coin pack (`myro_xp_launch_pack`) and ₹199 / month Personalised Engagement (`myro_job_switch_plan`, Razorpay Subscriptions). Folded, not re-priced. |
| **Untouched here** | ₹999 AI Workflow Audit (a different buyer) and Myrology ₹299 (awaiting the baggage decision). Both move onto Settlement; their products do not change. |
| **Not changed** | `WELCOME_XP = 3000`. The free allowance is tuned later from front-door numbers, not now. |

Product rules that shape the code:

- The reviewer's **name** is on a delivered check.
- When every check slot is taken, the buyer sees an **honest ETA before paying**;
  their 24-hour clock starts when their slot opens.
- Money in, grant not finished → the buyer sees **"Payment received · setting up
  your Apply Pack"**, which resolves by itself. After 1 hour it appears on the
  reviewer desk as a stuck payment with a retry.
- No buy button is ever shown that the server will refuse.

---

## 2 · The defect, measured (prod, 2026-09-30)

- **Revenue ever: ₹198** — two verified coin packs, May. Stuck at `created`: 18
  coin-pack orders, 4 Myrology, 1 engagement. `job_switch_plans` 0 rows,
  `job_switch_plan_reviews` 0, `ai_workflow_audits` 0.
- **Nobody has run out of coins.** 0 users below 100; median balance 3000;
  `cv_weave` spent 4 times, ever.
- **₹199 button hangs.** `billing.createOrder` in `lib/engagement-checkout.ts:42`
  is unguarded and `app/(authed)/job-switch-plan/page.tsx:77-93` has no `.catch`
  — any 503/409 leaves "Opening checkout…" forever.
- **Grant after the flip.** `_mark_payment_verified` flips `created→verified`,
  *then* `_apply_fulfilment` grants (`routers/payments.py:544-560`, `602-610`,
  `704-715`). A grant that fails is never retried: the retry sees
  `already_verified`. `activate_audit` swallows its own failure
  (`services/ai_workflow_audit.py:91-108`); renewals insert the paid row before
  `renew_period` (`payments.py:620-630`).
- **Unknown product unlocks Myrology** — the `else` at `payments.py:343-344`.
- **Coins break §Coin balance.** `xp_service.earn_xp` (`xp_service.py:56-62`)
  reads, adds, writes `coin_balance` — not atomic, no `coin_ledger` row. The
  right primitive already exists: `reward_coins` RPC, idempotent on
  `(user_id, action, ref_table, ref_id)` via `uq_coin_ledger_user_reward_ref`.
- **Four client checkouts**, four error behaviours: `lib/engagement-checkout.ts`,
  `app/myrology/checkout.tsx`, `components/settings-modal.tsx:381`
  (`handleBuyXP`), `components/preparations/audit-room.tsx`. Prices duplicated in
  `lib/api.ts` (~5027). The ₹199 price lives in five places.
- **Three HMAC functions, two credential cleaners** (`payments.py:116,167,177`,
  `engagement_subscription.py:30,74`).
- **Abandoned and paid-but-unreconciled look identical** — `billing_payments`
  status CHECK allows only `created | verified`; `payment.failed` is never read.

---

## 3 · The modules

### A. `billing_catalogue` — the only place a price lives

`backend/app/services/billing_catalogue.py`

```python
@dataclass(frozen=True)
class Product:
    alias: str          # request name: "apply_pack" | "ai_workflow_audit" | "myrology"
    key: str            # billing_payments.product
    price_paise: int
    coins: int          # 500 for apply_pack, 0 otherwise
    human_checks: int   # 1 for apply_pack, 0 otherwise

def by_alias(alias: str) -> Product        # raises UnknownProduct
def by_key(key: str) -> Product            # raises UnknownProduct — never a default
def availability(product: Product) -> Availability  # available | reason | eta
```

`GET /api/catalogue` (public read) returns, per product: `alias`, `price_paise`,
`available`, `unavailable_reason` (`not_configured` · `checks_full`), `eta`
(ISO, when a check slot opens). The client renders buttons only from this.

### B. `razorpay_gateway` — the only code that speaks Razorpay

`backend/app/services/razorpay_gateway.py`: one credential cleaner, the client,
`create_order(amount_paise, receipt)`, `checkout_signature_ok(order_id,
payment_id, signature)`, `webhook_signature_ok(raw_body, signature)`,
`parse_webhook(raw_body) -> Arrival | Failure | None`. Subscription signatures
and subscription parsing are **deleted**, not moved.

### C. `settlement` — a payment arrived; grant exactly once

`backend/app/services/settlement.py` — the deep module.

```python
@dataclass(frozen=True)
class Arrival:
    order_id: str
    payment_id: str
    source: Literal["checkout", "webhook"]

@dataclass(frozen=True)
class Settlement:
    outcome: Literal["granted", "already_granted", "grant_pending",
                     "unknown_order", "amount_mismatch"]
    user_id: str | None
    product: Product | None
    new_coin_balance: int | None   # §Coin balance: present only if it moved

def settle(arrival: Arrival, *, store: SettlementStore, grants: Grants) -> Settlement
def record_failure(order_id: str, payment_id: str, *, store: SettlementStore) -> None
```

Inside `settle`, in order:

1. **Find** the order row by `order_id`. None → `unknown_order`.
2. **Check** amount and currency against `by_key(row.product)`. Mismatch →
   `amount_mismatch`, logged `metric settlement.amount_mismatch`.
3. **Claim.** Compare-and-set `status in (created, failed) → verified`, writing
   `razorpay_payment_id`, `verified_at` and **`grant_pending = true`** in the same
   update. Lost the claim → re-read the row.
4. **Grant** if `grant_pending` is true (the claimer, *or* any later arrival for
   a row whose grant never finished). Grants are idempotent per payment row, so
   running one twice is harmless.
5. **Finish.** Compare-and-set `grant_pending true → false`. Return `granted`.
   Already false on entry → `already_granted`.

A grant that raises leaves `grant_pending = true` and returns `grant_pending`.
The **webhook answers 500** so Razorpay redelivers; the **checkout path answers
202** with `outcome: "grant_pending"` so the client shows "Payment received ·
setting up". Whichever arrives next finishes the grant.

**Grants** — a registry keyed by `Product.key`; an unknown key raises:

| Product | Grant (idempotent per `billing_payments.id`) |
|---|---|
| `apply_pack` | `xp_service.reward(user, 500, "apply_pack", ref_table="billing_payments", ref_id=row.id)` **and** `human_check.open(user, billing_payment_id=row.id, job_id=row.job_id)` |
| `ai_workflow_audit` | insert `ai_workflow_audits` with `billing_payment_id` (unique; conflict = done). **Remove the try/except swallow.** |
| `myrology` | set `myrology_unlocked` + `myrology_interested` |

**`SettlementStore`** is a Protocol with two adapters: Supabase (prod) and
in-memory (tests). `settle()` is the test surface; tests stop patching private
router helpers.

### D. `human_check` — the promise we sell, visible and checkable

`backend/app/services/human_check.py`, router `backend/app/routers/human_checks.py`.

Lifecycle: **unassigned → queued → in_review → delivered**. A held check has
no kind until it is used, so the waiting state is `unassigned`, not
`awaiting_job`.

- `open(user, billing_payment_id, job_id)` — idempotent on `billing_payment_id`.
  With a job → `queued` as `cv_job`; without (fuel door) → `unassigned`.
- `assign_job(user, check_id, job_id)` — the user picks a job; → `queued` as
  `cv_job`.
- `assign_linkedin(user, check_id, linkedin_url, whatsapp)` → `queued` as
  `linkedin`. The URL must be a member `/in/{vanity}` URL (the Reach Target
  rule). **Myro never fetches it**; the reviewer opens it in their own browser.
- `open_linkedin_with_coins(user, linkedin_url, whatsapp)` — inserts the check
  first, then `charge_coins(5000, "linkedin_check", ref_table="human_checks",
  ref_id=check.id)`; a refused charge deletes the row. No `billing_payment_id`.
- On `queued`: `slot_starts_at` = now if a slot is free, else when the earliest
  open check falls due; `due_at = slot_starts_at + 24h`. Reviewer is emailed a
  deep link to the check.
- `claim(check_id, reviewer)` → `in_review`.
- `deliver(check_id, note)` → `delivered`. The reviewer edits **the job's one
  document** (ADR-0025) through the CV Version Writer Seam; `delivered` requires
  a note and records the reviewed version id. User gets an email and a
  `user_notifications` row.
- `MAX_OPEN_CHECKS = 5` (`queued + in_review`, both kinds) feeds
  `availability()` — this replaces `MAX_OPEN_PASSES`.

**The `linkedin` kind, beyond the shared lifecycle:**

- On `claim`, Myro drafts the blocks from the CV and the reservoir
  (`linkedin_draft.draft`, `mentor_grounding.assemble`) — on the reviewer's tap,
  never on the payment path, as the engagement's review draft already does.
  Employers, titles, dates and schools are copied from the CV; pinned skills
  must be on its skills line; a number the CV and stories never state is listed
  in `flags` (ADR-0016). The delete list starts empty: only the reviewer, reading
  the public profile, can see LinkedIn's duplicates. The draft (`draft`) is the
  reviewer's and never reaches the browser.
- `deliver` requires the note **and** the reviewer's signed blocks (`blocks`).
  The clock stops there. The reviewer then books the paste call on WhatsApp.
- `close_call(check_id, pasted)` — sets `call_closed_at`, sets `pasted_at` when
  the user pasted on the call, and **always clears `contact_whatsapp`**: the
  number exists only to book that call.
- A late check is not refunded; it is delivered late (ENG3).

User endpoints: `GET /human-checks` (mine), `POST /human-checks/{id}/job`,
`POST /human-checks/{id}/linkedin`, `POST /human-checks/linkedin` (coins).
`GET /api/catalogue` gives `human_check.checks_full`, `ready_by` (when a check
bought now comes back) and `linkedin_coins`.
Reviewer endpoints behind the one `require_admin` guard
(`security/admin_auth.py:23`): `GET /admin/human-checks` (queue by `due_at`, plus
**stuck payments** — `grant_pending` older than 1 hour — with a retry that calls
`settle` again), `POST .../claim`, `POST .../deliver`, `POST .../close-call`, and
`POST /admin/payments/{id}/settle` (the stuck-payment retry).

---

## 4 · Migrations (additive; agent applies)

- **M1 `billing_payments`:** `grant_pending boolean not null default false`;
  `job_id text null`; `failed_at timestamptz null`; status CHECK →
  `created | verified | failed`. Historical rows default to not-pending — no data
  rewrite.
- **M2 `ai_workflow_audits`:** `billing_payment_id uuid null unique references
  billing_payments(id)`.
- **M3 `human_checks`:** `id uuid pk`, `user_id uuid`, `billing_payment_id uuid
  null unique references billing_payments(id)` (null when bought with coins),
  `kind text null check (cv_job|linkedin)`, `job_id text null`, `status text
  check (unassigned|queued|in_review|delivered)`, `slot_starts_at`, `due_at`,
  `reviewer_name text`, `note text`, `reviewed_cv_version_id bigint`,
  `linkedin_url text`, `contact_whatsapp text`, `draft jsonb`, `blocks jsonb`,
  `pasted_at`, `call_closed_at`, `delivered_at`, `created_at default now()`. RLS select-own, with
  `contact_whatsapp` left out of the user-facing select. Index `(status, due_at)`.
- **M4 — only on Shivam's explicit yes:** drop `job_switch_plans` and
  `job_switch_plan_reviews` (0 rows on 2026-09-30). Until then leave them.

---

## 5 · The client

### `frontend/lib/checkout.ts` — one checkout

```ts
type CheckoutOutcome =
  | { kind: "paid"; newCoinBalance: number | null }
  | { kind: "setting_up" }                     // 202 grant_pending
  | { kind: "dismissed" }
  | { kind: "unavailable"; reason: string; eta?: string }
  | { kind: "failed"; reason: string }

checkout(args: { product: "apply_pack" | "ai_workflow_audit" | "myrology"; jobId?: string }): Promise<CheckoutOutcome>
```

It loads Razorpay, creates the order (**caught** — a refusal becomes
`unavailable`/`failed`, never a hung button), opens checkout, verifies, and maps
every exit to one outcome. It never rejects. `useCatalogue()` (TanStack Query on
`GET /api/catalogue`) decides whether a button renders and what it costs.
Myrology and the audit move onto this module with their UX unchanged.

### The three doors and the pack page

- **Fuel:** `XPGateModal` primary action becomes the Apply Pack (price from the
  catalogue). "See how Myro Coins work" becomes the quiet secondary.
- **Stakes:** the playground header on a **job** document (never the master)
  gets "Human check before you apply". If the user already holds an unused check
  (`unassigned`), it reads "Use your human check" and costs nothing.
- **LinkedIn:** a card on the CV page after the score. Price from the catalogue
  (5,000 coins, or the pack); an `unassigned` check makes it free. Two fields: the
  `/in/` URL and WhatsApp. Delivered → the signed blocks, each with Copy, and a
  plain link to the user's own LinkedIn.
- **Status on the CV:** "Human check · due {time}" while open; "Checked by
  {name}" + the note once delivered.
- **Pack page:** new `/apply-pack`. `/job-switch-plan` becomes a redirect shim so
  the LinkedIn Services door (`?utm_source=linkedin_services`) keeps working.
- **Reviewer desk:** `/admin/checks`, same entry pattern as `/admin/growth`; add
  it to the reach allowlist `external`.

`/frontend-design` rules apply: tokens only, 375px first, the four beats of a
click, and design over words — the status line *is* the state; no paragraph
explaining it.

---

## 6 · Work, in order

| # | Slice | Done when |
|---|---|---|
| **S1** | M1 + M2. `billing_catalogue`, `razorpay_gateway`, `settlement`. `routers/payments.py` becomes thin: create-order (catalogue → availability → gateway → record, carrying `job_id`), verify (signature → `settle`), webhook (signature → `settle` or `record_failure`). Coins through `reward_coins`. Myrology, audit and filing intake through `settle`. **Built 2026-11-22 (Claude):** `xp_pack` stays sellable until S3 and `job_switch_plan` until S5 — refusing them before the pack's checkout exists would leave two buy buttons the server turns down. | `test_settlement.py` green: duplicate arrival · webhook first · checkout first · grant raises then second arrival completes (one ledger row) · unknown product raises · amount mismatch · failed then captured · two concurrent claims grant once |
| **S2** | M3. `human_check` service + routers, both kinds; `apply_pack` product and grant; the 5,000-coin LinkedIn path; reviewer + user notifications; `/api/catalogue` with `checks_full` + ETA. | `test_human_check.py`: transitions, capacity across both kinds, ETA, `cv_job` deliver requires a note and a reviewed version, `linkedin` deliver requires a note and blocks, a refused coin charge leaves no row, `close_call` clears the WhatsApp number |
| **S3** | `lib/checkout.ts`, `useCatalogue`, both doors, `/apply-pack`, CV status line. Refuse `xp_pack` at create. Remove the Settings coin-pack tab (`settings-modal.tsx:381-453, 931-936, 1044`), `lib/engagement-checkout.ts`, `plan-line.tsx`; retarget `skill-path-maps.tsx:179` and `intel-job-switch-plan.tsx` to the pack. | `checkout.test.ts` runs the real function with a fake Razorpay: createOrder rejects → no hang · dismiss → `dismissed` · 202 → `setting_up` |
| **S4** | `/admin/checks` reviewer desk incl. stuck payments + retry. | Deliver a check end to end on dev with the QA account |
| **S5** | **Delete on the way past:** the `job_switch_plan` product and its subscription path in `payments.py`, `services/engagement_subscription.py`, `razorpay_gateway.create_subscription`, subscription code in `payments.py`, `job_switch_plan_service.py`, `job_switch_plan_draft.py`, `routers/job_switch_plan.py`, `billing_month.py` if nothing else imports it, their tests, and config `razorpay_engagement_plan_id`, `engagement_sales_enabled`, `job_switch_admin_token`; rename `job_switch_reviewer_email` → `human_check_reviewer_email`, add `human_check_reviewer_name`. Docs: OFFERING.md (ENG2), DECISIONS.md, CONTEXT.md (Apply Pack, Human Check, Settlement; retire Engagement Scene), INFRA.md env. | grep finds no `job_switch_plan` / `engagement` code path; six gates green |
| **S6** | M4, **only after Shivam says yes.** | — |

---

## 7 · Shivam's checklist (not agent work)

1. Razorpay dashboard → webhook `https://<prod api>/api/razorpay/webhook`, events
   **`payment.captured` + `payment.failed`**; the secret equals
   `RAZORPAY_WEBHOOK_SECRET` on Railway prod (and dev, with the test-mode pair).
2. Vercel prod `NEXT_PUBLIC_RAZORPAY_KEY_ID` is the live key matching Railway
   `RAZORPAY_KEY_ID`.
3. Railway: `HUMAN_CHECK_REVIEWER_NAME`, `HUMAN_CHECK_REVIEWER_EMAIL`.
4. Counsel list (#17): a refund line for the Apply Pack in Terms §07; GST
   invoicing for a ₹199 digital sale.
5. Yes / no on M4.

**No Razorpay plan id is needed any more** — the pack is a plain order.

---

## 8 · Out of scope, deliberately

A monthly subscription (rebuild only if repeat buyers appear) · changing
`WELCOME_XP` · automated refunds · Myrology and audit product changes (baggage
branch) · the ₹999 audit's own reviewer flow beyond moving it onto Settlement.

## 9 · How we will know it worked

- Razorpay **test mode on dev**, QA account: buy the pack from each door →
  `coin_ledger` gains exactly one `apply_pack` row of +500 → a `human_checks` row
  is `queued` (stakes) or `unassigned` (fuel) → reviewer email arrives → deliver
  → the CV shows "Checked by {name}".
- Kill the grant mid-flight in a test → the next arrival finishes it; still one
  ledger row.
- On prod, `billing_payments` with `grant_pending = true` older than 1 hour stays
  at **0**; anything else is on the reviewer desk.
- Every buy button in the app is rendered from `/api/catalogue`; none can open a
  503.
- LinkedIn: a QA-account check bought with coins drafts on `queued`, is
  delivered with signed blocks, and `close_call` leaves `contact_whatsapp` null.
  On prod the number to watch is LinkedIn checks with `pasted_at` set.
