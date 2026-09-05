from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).parent.parent / ".env"

# The three environments Myro maintains, loosest to strictest.
_RELEASE_TIERS = ("sandbox", "dev", "prod")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""
    # Supabase project JWT secret (HS256). When set, access tokens are verified
    # LOCALLY in deps.get_current_user — no network round-trip to Supabase Auth
    # per request. Empty = fall back to the remote auth.get_user() path (ships
    # safe before the secret is provisioned). Find it in:
    # Supabase dashboard → Project Settings → API → JWT Settings → JWT Secret.
    supabase_jwt_secret: str = ""

    # ASYMMETRIC (ES256/RS256) access-token verification. Supabase projects on
    # JWT signing keys (ECC P-256 / RSA) sign tokens with a private key; we
    # verify locally against the project's PUBLIC keys (JWKS) — no secret, no
    # per-request round-trip. Empty = derived from supabase_url. Override only
    # for a non-standard auth host. See deps._asymmetric_signing_key.
    supabase_jwks_url: str = ""

    # Backlog #16 (prod read-capacity). Sync FastAPI routes (`def`, not
    # `async def`) run in Starlette's default AnyIO thread limiter — 40 tokens
    # out of the box. Each Supabase/PostgREST call blocks its thread for up to
    # `_POSTGREST_TIMEOUT_SECONDS` (8s), so a concurrent burst exhausts 40
    # threads fast: prod logs show request clusters landing together at
    # exactly ms=8023-8029 (the timeout), not spread out — a thread-starvation
    # signature, not compute (CPU stays <1% during these bursts). Raising this
    # does NOT raise Postgres connection count — the app talks to PostgREST
    # over HTTP, and PostgREST enforces its own connection pool independent of
    # how many concurrent HTTP requests hit it. Kept conservative (100, not
    # 200) pending a decision on the actual Supabase compute tier (currently
    # max_connections=60 on the DB itself, shared by dev+prod+worker+MCP).
    sync_threadpool_tokens: int = 100

    # A process-local bulkhead for synchronous Supabase Data API reads. It is
    # not a replacement for query tuning; it prevents one browsing burst from
    # making every other user wait for Postgres' statement timeout.
    #
    # Raised 12 -> 40 (ARCHITECTURE_READ_PATH.md S5), same reasoning already
    # applied to sync_threadpool_tokens above: PostgREST enforces its own
    # connection pool independent of how many concurrent HTTP requests hit
    # it, so this number does not map 1:1 to Postgres connections — it only
    # bounds how many concurrent PostgREST calls THIS process will issue.
    # 12 was provably too tight for the stated 100s-of-concurrent-users
    # target: /home/bootstrap alone can occupy up to 8 of it from ONE
    # request (S4), so two concurrent dashboard loads already exceeded the
    # old cap. Raised to 40, not deleted: prod runs ONE replica today
    # (verified via Railway), max_connections=60 is shared by dev+prod+
    # worker+verifier+MCP, and several read paths are fixed (S0-S1) but not
    # all — get_user_match_stack/compute_match_health (jobs/matches' own
    # internals) are still slow and were deliberately left un-root-caused
    # this pass (scoring logic, not a query-shape bug). This number is a
    # reasoned estimate against that evidence, not a load-tested guarantee —
    # verify under real concurrent traffic before assuming headroom beyond
    # this, and revisit alongside the actual Supabase compute-tier decision.
    supabase_read_max_inflight: int = 40
    supabase_read_queue_timeout_seconds: float = 0.25

    # Daily Notice digest (ADR-0021). Empty = closer skips mail, rows still persist.
    ops_alert_email: str = ""

    # Turnstile is an optional hardening layer for public, no-auth endpoints.
    # Keep disabled until both deployment keys are intentionally provisioned.
    # Per-IP limits remain active either way.
    turnstile_enabled: bool = False
    turnstile_secret: str = ""

    # Local LLM via LM Studio (priority 0 — no rate limits)
    lm_studio_tagger_model: str    = ""
    lm_studio_ranker_model: str    = ""
    lm_studio_extractor_model: str = ""
    lm_studio_base_url: str        = "http://localhost:1234/v1"

    # LLM keys — user-blocking fallback order: paid OpenRouter → Groq → Gemini.
    # Background/fail-soft work can still use the free-first provider.
    groq_api_key: str      = ""
    google_api_key: str    = ""
    openrouter_api_key: str = ""
    openai_api_key: str    = ""
    anthropic_api_key: str = ""

    # Email (post-MVP)
    sendgrid_api_key: str = ""
    resend_api_key: str = ""
    resend_from_email: str = "Myro <noreply@himyro.com>"

    # Myrology — booking requests are emailed to the in-house astrologer
    myrology_astrologer_email: str = ""

    # Institutions (B2B beta) — placement-cell applications are emailed here for
    # manual sales follow-up. Empty = persist-only (email send is skipped).
    institutions_lead_email: str = ""

    # Distribution Tracker — access requests from signed-in non-operators are
    # emailed here so the owner can promote them. Empty = persist-only.
    growth_ops_email: str = ""

    # Razorpay checkout
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    # Razorpay webhook secret (set when creating the webhook in the Razorpay
    # dashboard → Settings → Webhooks). Signs the raw request body; we verify it
    # in payments.razorpay_webhook. Empty = the webhook endpoint returns 503 so
    # the frontend verify-payment path stays the only fulfilment route (safe
    # before the webhook is provisioned). This closes the "paid but the browser
    # never called verify-payment" gap (tab closed / network drop after capture).
    razorpay_webhook_secret: str = ""

    # Myrology — token guarding the internal booking-status transition endpoint
    # (PATCH /myrology/bookings/{id}/status). Lets the astrologer/ops advance a
    # booking requested -> confirmed -> done. Empty = the endpoint returns 503.
    myrology_admin_token: str = ""

    # ₹99 Personalised Job-Switch Plan (#33). Review requests are emailed to the
    # founder/HITL reviewer here (empty = persist-only, email skipped). The admin
    # token guards the review-status transition endpoint (empty = endpoint 503).
    job_switch_reviewer_email: str = ""
    job_switch_admin_token: str = ""

    # Backlog #36 (event-driven matching) — token guarding the scrape-landed
    # webhook (POST /internal/scrape/landed). The scraper (firecrawl_Supabase)
    # fires this after it finishes writing a batch of new jobs, so the app sweeps
    # + notifies affected users immediately instead of polling. Empty = the
    # endpoint returns 503 (safe before the scraper is wired).
    scrape_webhook_token: str = ""

    # Environment / release tier.
    #
    # MYRO_ENV is the EXPLICIT release-tier boundary and the only value that
    # should be trusted going forward: "sandbox" (a laptop), "dev" (the Develop
    # backend + Vercel preview frontends), "prod" (himyro.com). Everything else
    # here is inference, and inference is what let the dev API boot for days with
    # a CORS allowlist that named no dev frontend (2026-07-27). Set MYRO_ENV on
    # every Railway service; leave it empty locally.
    #
    # Railway-specific note: Myro deliberately runs BOTH backend services inside
    # one Railway environment object named "production", so RAILWAY_ENVIRONMENT
    # says "production" on the dev service too and can never be the tier by
    # itself. The service name is the fallback boundary.
    myro_env: str = ""
    railway_environment: str = "development"
    railway_service_name: str = ""
    debug: bool = False

    # Redis (durable async jobs)
    redis_url: str = ""
    job_compute_queue_name: str = "jobs_compute"
    job_compute_status_ttl_seconds: int = 24 * 3600
    job_compute_lock_ttl_seconds: int = 30 * 60

    # Provider Budget (ADR-0008) — global ceiling on concurrent LLM calls so a
    # load spike can never trip provider rate limits. Per-process asyncio cap
    # today (single web process is the only LLM caller); becomes a Redis token
    # bucket once Job Runners exist. Tune from measured 429 rate.
    llm_max_concurrency: int = 8
    # Rate-limit-aware retry inside LLMProvider.complete, per provider entry.
    llm_transient_retries: int = 2
    llm_retry_base_seconds: float = 1.0
    llm_retry_max_seconds: float = 20.0
    # Per-request HTTP timeout on every provider client. Without this the OpenAI
    # SDK default (600s + its own internal retries) lets ONE stalled provider
    # block a user-facing call for minutes before the fallback ladder can reach
    # the fast Groq lane (the 2m15s anon /score-cv incident). A slow-but-real
    # 4096-token extraction finishes well inside this; a genuine stall trips here
    # and falls through. SDK-level retries are disabled so the app loop owns them.
    llm_request_timeout_seconds: float = 45.0

    # CORS — comma-separated string of EXACT origins, e.g.:
    # ALLOWED_ORIGINS=https://himyro.com,https://www.himyro.com
    allowed_origins: str = "http://localhost:3000"

    # The app's own front door, used to BUILD urls we hand out (partner SSO
    # sign-in links). Deliberately not derived from a request header — a partner
    # supplies only a relative path, and the origin comes from here, so a bad
    # `Host` or a partner-supplied absolute url can never redirect our sign-in
    # links off-site. Empty = the first entry in ALLOWED_ORIGINS.
    app_base_url: str = ""

    # Non-production preview origins, as an anchored regex.
    #
    # Vercel mints a NEW origin for every preview deployment
    # (truemirror-<deploy-hash>-<team>.vercel.app) alongside the stable branch
    # alias, so the dev tier CANNOT be served by an exact allowlist — it would
    # break on every push to Develop. That is exactly what happened on
    # 2026-07-27: the dev API's allowlist named only the prod alias and
    # localhost, so every preflight from a preview build answered 400 and the
    # app rendered an empty shell.
    #
    # Applied ONLY when release_tier != "prod" (see cors_origin_regex).
    # Production stays exact-match and validate_runtime_configuration refuses to
    # boot a prod service that carries a regex.
    preview_origin_regex: str = r"^https://truemirror-[a-z0-9-]+\.vercel\.app$"

    # CV upload fallback + observability
    cv_upload_support_email: str = "support@himyro.com"
    cv_upload_fallback_form_url: str = ""
    cv_upload_alert_window_minutes: int = 15
    cv_upload_alert_min_samples: int = 25
    cv_upload_alert_failure_ratio: float = 0.25

    # Listing-verification belt. The sweep claims a batch every ~15 min, so two
    # hours of silence is several missed ticks — a stall, not a slow run.
    verifier_dead_man_hours: int = 2
    verifier_health_interval_minutes: int = 5
    verifier_priority_stale_hours: int = 24

    @property
    def release_tier(self) -> str:
        """Which of the three environments this process is: sandbox | dev | prod.

        Resolution order, most explicit first. Anything below MYRO_ENV is
        inference kept for services that have not been given the variable yet.
        """
        declared = self.myro_env.strip().lower()
        if declared in _RELEASE_TIERS:
            return declared

        service_name = self.railway_service_name.strip()
        if service_name == "mirror-backend-prod":
            return "prod"
        if service_name == "mirror-backend-dev":
            return "dev"
        # Any other Railway service (worker, verifier) reads the platform
        # environment. It says "production" for every Myro service, which is the
        # fail-safe direction: an unlabelled service gets the strictest tier.
        if self.railway_environment.strip().lower() == "production":
            return "prod"
        return "sandbox"

    @property
    def is_production(self) -> bool:
        return self.release_tier == "prod"

    def validate_runtime_configuration(self) -> None:
        """Reject configuration a tier cannot actually serve, before it takes traffic.

        Runs on EVERY deployed tier, not just production. A dev API with no
        usable CORS origin, or no Supabase, is just as broken as a misconfigured
        prod one — it simply fails in a way nobody is paged about. Sandbox is
        exempt so a laptop can boot on a partial .env.
        """
        tier = self.release_tier
        if tier == "sandbox":
            return

        self._validate_deployed_baseline()
        if not self.is_production:
            return

        required_values = {
            "SUPABASE_URL": self.supabase_url,
            "SUPABASE_ANON_KEY": self.supabase_anon_key,
            "SUPABASE_SERVICE_KEY": self.supabase_service_key,
            "REDIS_URL": self.redis_url,
            "ALLOWED_ORIGINS": self.allowed_origins,
            "RAZORPAY_KEY_ID": self.razorpay_key_id,
            "RAZORPAY_KEY_SECRET": self.razorpay_key_secret,
            "RAZORPAY_WEBHOOK_SECRET": self.razorpay_webhook_secret,
        }
        missing = sorted(
            name for name, value in required_values.items() if not value.strip()
        )
        placeholders = sorted(
            name
            for name, value in required_values.items()
            if value.strip()
            and (
                "your-" in value.lower()
                or "replace_with" in value.lower()
                or "[your-" in value.lower()
            )
        )
        provider_keys = (
            self.openrouter_api_key,
            self.groq_api_key,
            self.google_api_key,
        )
        usable_provider_keys = [
            key
            for key in provider_keys
            if key.strip() and "your-" not in key.lower()
        ]
        if not usable_provider_keys:
            if any(key.strip() for key in provider_keys):
                missing.append("LLM provider key (placeholder value is forbidden)")
            else:
                missing.append("OPENROUTER_API_KEY or GROQ_API_KEY or GOOGLE_API_KEY")
        if self.allowed_origins.strip() == "*":
            missing.append("ALLOWED_ORIGINS (wildcard is forbidden in production)")
        if any(
            not origin.strip().startswith("https://")
            for origin in self.allowed_origins.split(",")
            if origin.strip()
        ):
            missing.append("ALLOWED_ORIGINS (must use HTTPS in production)")
        if self.debug:
            missing.append("DEBUG (must be false in production)")
        if self.supabase_url and not self.supabase_url.startswith("https://"):
            missing.append("SUPABASE_URL (must use HTTPS in production)")
        missing.extend(f"{name} (placeholder value is forbidden)" for name in placeholders)

        if missing:
            names = ", ".join(missing)
            raise ValueError(f"Invalid production configuration: {names}")

    def _validate_deployed_baseline(self) -> None:
        """What any deployed tier needs to serve a browser at all."""
        missing = sorted(
            name
            for name, value in {
                "SUPABASE_URL": self.supabase_url,
                "SUPABASE_ANON_KEY": self.supabase_anon_key,
                "SUPABASE_SERVICE_KEY": self.supabase_service_key,
            }.items()
            if not value.strip()
        )
        # A deployed API must be reachable by its OWN frontend. Exact origins
        # alone are enough for prod; the dev tier may instead (or also) carry the
        # preview regex, because its frontend origin changes every deploy.
        if not self.cors_origins and not self.cors_origin_regex:
            missing.append("ALLOWED_ORIGINS or PREVIEW_ORIGIN_REGEX")
        if missing:
            names = ", ".join(missing)
            raise ValueError(
                f"Invalid {self.release_tier} configuration: {names}"
            )

    @property
    def cors_origin_regex(self) -> str:
        """Preview-origin regex, honoured only outside production."""
        if self.is_production:
            return ""
        return self.preview_origin_regex.strip()

    @property
    def cors_origins(self) -> list[str]:
        if self.allowed_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def public_app_url(self) -> str:
        """Origin for urls we mint and hand to third parties. Explicit override
        wins; otherwise the first CORS origin, which is by definition an origin
        this deployment already trusts to be its own frontend."""
        explicit = self.app_base_url.strip().rstrip("/")
        if explicit:
            return explicit
        for origin in self.cors_origins:
            if origin != "*":
                return origin.rstrip("/")
        return ""

    @property
    def jwks_url(self) -> str:
        """JWKS endpoint for asymmetric token verification. Explicit override
        wins; otherwise derived from the Supabase project URL. Empty when no
        Supabase URL is configured (local verification then can't run for
        asymmetric tokens, and deps falls back to the remote path)."""
        if self.supabase_jwks_url:
            return self.supabase_jwks_url
        if self.supabase_url:
            return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        return ""


settings = Settings()
