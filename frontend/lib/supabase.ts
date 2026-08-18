import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js"
import { authFlowTypeForUrl } from "@/lib/auth/callback-flow"
import { migrateTabSessionToDurable } from "@/lib/session"

let browserClient: SupabaseClient | null = null

export function createClient() {
  if (browserClient) return browserClient
  if (typeof window === "undefined") {
    throw new Error("Supabase browser client requested during server rendering")
  }
  try {
    migrateTabSessionToDurable(window.localStorage, window.sessionStorage)
  } catch {
    // Private mode / quota — the client still mounts; session.ts falls back.
  }
  browserClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storage: window.localStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: authFlowTypeForUrl(window.location.href),
      },
    },
  )
  return browserClient
}
