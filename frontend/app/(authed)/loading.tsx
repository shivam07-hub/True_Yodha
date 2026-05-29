import { Skeleton } from "@/components/ui/skeleton"

// Renders INSIDE the persistent AppShell (mounted by (authed)/layout.tsx), so the
// top-bar / sidebar stay put while only the content region shimmers. Never the
// full-screen MYRO splash. Generic content placeholder — Vercel/Supabase pattern:
// persistent chrome + neutral content shimmer during the brief nav/data wait.
export default function AuthedLoading() {
  return (
    <div aria-hidden="true" style={{ height: "100%", overflow: "hidden", padding: "24px var(--tm-page-px, 24px)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* header line */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton style={{ width: 200, height: 24, borderRadius: 8 }} />
          <Skeleton style={{ width: 320, height: 14, borderRadius: 4 }} />
        </div>
        {/* stat tiles row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ height: 84, borderRadius: "var(--tm-radius-lg, 12px)" }} />
          ))}
        </div>
        {/* body cards */}
        {[0, 1].map((i) => (
          <Skeleton key={i} style={{ height: 132, borderRadius: "var(--tm-radius-lg, 12px)" }} />
        ))}
      </div>
    </div>
  )
}
