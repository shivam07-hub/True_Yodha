# Myro Partner API — v1

For platforms that want to hand their users into Myro and receive job openings
for them. Written to be handed to a partner's engineers as-is.

Base URL: `https://api.himyro.com`
All endpoints are under `/partner/v1`. Versioned in the path: a breaking change
ships as `/partner/v2`, never as a redeploy of v1.

---

## 1. Authentication

Every call carries an API key:

```
Authorization: Bearer myro_live_<prefix>_<secret>
```

Keys are **server-side only**. A key in browser JavaScript or a mobile app is a
key that can mint sign-in sessions for your users; treat it like a database
password.

Each key carries scopes. Ask for only what you need:

| Scope | Grants |
|---|---|
| `sso` | `POST /sso/session` |
| `jobs.read` | `GET /users/{external_id}/jobs` |
| `webhooks.manage` | the `/webhook*` endpoints |

Rate limit: 600 requests/minute per key. Over it → `429` with `Retry-After`.

Errors are `{"detail": "..."}` with the usual status codes. `401` covers every
key failure — unknown, wrong, revoked, suspended — on purpose.

---

## 2. Direct portal access (SSO)

Your server calls this when one of your signed-in users clicks "Open Myro". You
send us the identity you already verified; we return a **one-time sign-in url**
for that user's browser.

```http
POST /partner/v1/sso/session
Authorization: Bearer <key>
Content-Type: application/json

{
  "external_id": "user_84213",
  "email": "asha@example.com",
  "full_name": "Asha R"
}
```

`external_id` is **your** id for the user, and it is the handle you use in every
later call. Send the same one every time — it is how we know it's the same
person even if their email changes.

### Response — the happy path

```json
{
  "mode": "direct",
  "login_url": "https://api.himyro.com/auth/v1/verify?token=...",
  "user_ref": "b2c1…",
  "message": "Account created and linked."
}
```

Redirect the user's **browser** to `login_url`. It works once, expires shortly,
and lands them in Myro signed in. Do not fetch it server-side, log it, or email
it — consuming it burns it.

### Response — verification required

```json
{
  "mode": "verification_required",
  "login_url": null,
  "user_ref": "b2c1…",
  "message": "This email already has a Myro account. We've emailed the owner a sign-in link to connect it — no action needed from you."
}
```

This is not an error. It means the address already belongs to a Myro account
that predates your integration, so we cannot take your word that you speak for
it. We email that person a sign-in link; when they use it, the accounts connect
and every later `sso/session` call for that `external_id` returns `mode:
"direct"`.

Show your user something like *"Check your email to finish connecting Myro."*

**Why it works this way:** without this gate, anyone holding your API key could
mint a session for any Myro account whose email they could guess. The gate is
the difference between an integration and a master key.

### Where the user lands

New users land on onboarding, returning users on their job feed. The destination
is Myro's to choose — there is no `redirect` parameter, deliberately.

---

## 3. Job openings

### 3a. Webhook (push) — recommended

Register your endpoint once:

```http
PUT /partner/v1/webhook
Authorization: Bearer <key>

{
  "url": "https://your-app.example/hooks/myro",
  "event_types": ["job_matches.new", "ping"]
}
```

The response contains `signing_secret` — **shown once**. Store it. Re-registering
rotates it and invalidates the old one.

Your url must be absolute `https`, resolving to a public address. Private,
loopback and cloud-metadata addresses are refused at registration.

We `POST` one event **per user** who has openings they have not been sent yet:

```http
POST https://your-app.example/hooks/myro
X-Myro-Event: job_matches.new
X-Myro-Event-Id: evt_9f2c…            ← idempotency key, dedupe on this
X-Myro-Delivery-Attempt: 1
X-Myro-Signature: t=1754476800,v1=<hex>

{
  "id": "evt_9f2c…",
  "type": "job_matches.new",
  "created_at": "2026-08-06T09:00:00+00:00",
  "partner": "finlatics",
  "user": { "external_id": "user_84213", "email": "asha@example.com", "user_ref": "b2c1…" },
  "jobs": [
    {
      "job_id": "…",
      "title": "Business Analyst",
      "company": "Acme",
      "location": "Bengaluru",
      "location_city": "Bengaluru",
      "location_country": "India",
      "work_mode": "onsite",
      "role_domain": "finance",
      "seniority_level": "entry",
      "min_years_experience": 0,
      "max_years_experience": 2,
      "skills": ["Excel", "SQL"],
      "apply_url": "https://…",
      "first_seen_at": "2026-08-01T00:00:00+00:00"
    }
  ]
}
```

**Verify the signature before trusting the body:**

```python
import hashlib, hmac

def verify(secret: str, header: str, raw_body: bytes, tolerance: int = 300) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    timestamp, signature = parts["t"], parts["v1"]
    if abs(time.time() - int(timestamp)) > tolerance:
        return False                      # replay window
    expected = hmac.new(
        secret.encode(), f"{timestamp}.".encode() + raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
```

Sign over the **raw** body bytes, not a re-serialised dict.

**Respond `2xx` fast.** Queue the email on your side; do not send it inside the
request. Anything non-2xx, or a timeout past 10s, is a failed attempt.

Retries: 1min → 5min → 30min → 2h → 6h, then the delivery is marked `failed` and
is not retried. 20 consecutive failures pause your endpoint — re-register to
resume. Retries reuse the same `X-Myro-Event-Id`, so dedupe on it.

Test the whole path (same signing, same retries, same log):

```http
POST /partner/v1/webhook/test
```

Inspect what we sent:

```http
GET /partner/v1/webhook/deliveries?limit=20
```

### 3b. Pull

Push and pull answer the same question; use pull to integrate before your
endpoint is live, to backfill after an outage, or to reconcile.

```http
GET /partner/v1/users/user_84213/jobs?limit=10&max_experience_years=2
```

```json
{ "external_id": "user_84213", "user_ref": "b2c1…", "count": 3, "jobs": [ … ] }
```

| Query | Meaning |
|---|---|
| `limit` | 1–25, default 10 |
| `max_experience_years` | keep only roles asking for at most this many years |
| `include_delivered` | `true` to also return openings already pushed to you |

`409` means the user's account is not linked yet — they were emailed a sign-in
link (see §2).

**Reading does not consume.** The "already sent" ledger only advances when we
actually push an event, so polling this endpoint never eats a user's alerts.

### What makes a job relevant

Role family, seniority band, saved locations and CV skill overlap — from the
user's own Myro profile. **A user who has not completed onboarding has no
profile to match against, so their results are generic.** The single biggest
thing you can do for relevance is get your users through onboarding once.

Openings we believe are no longer live are never sent.

---

## 4. What we need from you

1. A server that can hold an API key.
2. Your stable user id (`external_id`) and their email.
3. A webhook url, if you want push.
4. Consent from your users to share their email with Myro, and a signed DPA —
   under India's DPDP Act you are the data fiduciary for the identities you send
   us.

Nothing else. No CV, no phone number, no resume file.

---

## 5. Operating it (Myro side)

```bash
python -m scripts.partner_admin create --slug finlatics --name "Finlatics"
python -m scripts.partner_admin key --slug finlatics --scopes sso,jobs.read,webhooks.manage
python -m scripts.partner_admin list
python -m scripts.partner_admin revoke --prefix <key_prefix>
```

Two scheduled calls make the push half work. Both are guarded by
`X-Scrape-Token`:

| Endpoint | Cadence | Without it |
|---|---|---|
| `POST /internal/partners/webhook-sweep` | every 5 min | **nothing retries a failed delivery** |
| `POST /internal/partners/broadcast` | after a scrape landing (automatic) or on a schedule | no events are emitted |

Run a broadcast with `{"dry_run": true}` against a new partner first — the
ledger cannot be un-written.

Requires `APP_BASE_URL` (or a correct first entry in `ALLOWED_ORIGINS`): it is
the origin baked into every sign-in link we hand out.

### Honest state of the inventory

The scraper has not run since **2026-07-27**. August has ingested one job. Push
will fire correctly and deliver nothing new until ingestion restarts — a
partner's first broadcast draws down the existing pool, then goes quiet. Say so
before promising a partner "new openings".
