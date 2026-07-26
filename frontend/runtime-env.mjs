const CRITICAL_BUILD_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_RAZORPAY_KEY_ID",
]

const CRITICAL_PRODUCTION_DEPLOYMENT_ENV = [
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "NEXT_PUBLIC_SITE_URL",
]

const OPTIONAL_FALLBACK_ENV = [
  "API_INTERNAL_URL",
]

export function validateProductionEnv(env) {
  if (env.NODE_ENV !== "production") return

  const isVercelPreview = env.VERCEL_ENV === "preview"
  const requiredNames = [
    ...CRITICAL_BUILD_ENV,
    ...(isVercelPreview ? [] : CRITICAL_PRODUCTION_DEPLOYMENT_ENV),
  ]
  const missing = requiredNames.filter(
    (name) => !String(env[name] ?? "").trim(),
  )
  if (
    !String(
      env.NEXT_PUBLIC_API_BASE_URL ?? env.NEXT_PUBLIC_API_URL ?? "",
    ).trim()
  ) {
    missing.push("NEXT_PUBLIC_API_BASE_URL or NEXT_PUBLIC_API_URL")
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing critical production environment variables: ${missing.join(", ")}`,
    )
  }

  const configuredNames = [
    ...CRITICAL_BUILD_ENV,
    ...CRITICAL_PRODUCTION_DEPLOYMENT_ENV,
    ...OPTIONAL_FALLBACK_ENV,
    "NEXT_PUBLIC_API_BASE_URL",
    "NEXT_PUBLIC_API_URL",
  ]
  for (const name of configuredNames) {
    const value = String(env[name] ?? "").trim().toLowerCase()
    if (value && (value.includes("your-") || value.includes("replace_with"))) {
      throw new Error(`${name} contains a forbidden placeholder value`)
    }
  }

  const urlNames = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_API_BASE_URL",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_SITE_URL",
    "API_INTERNAL_URL",
  ]
  for (const name of urlNames) {
    const value = String(env[name] ?? "").trim()
    if (value && !value.startsWith("https://")) {
      throw new Error(`${name} must use HTTPS in production`)
    }
  }
}
