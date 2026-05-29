import { Skeleton } from "@/components/ui/skeleton"

// Scoped newsletter loader. Lives INSIDE the layout (top-nav + footer persist),
// so the global full-screen MYRO-splash skeleton (app/loading.tsx) can never
// leak into the newsletter surface. With SSG + eager prefetch this is rarely
// seen in production; when it is, it's a calm article-shaped shimmer, not a splash.
export default function NewsletterLoading() {
  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "32px var(--tm-page-px) 96px" }}>
      <div className="nl-grid">
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }} aria-hidden="true">
          {/* back link */}
          <Skeleton style={{ width: 96, height: 14, borderRadius: 4, marginBottom: 24 }} />
          {/* tag + date */}
          <div style={{ display: "flex", gap: 8 }}>
            <Skeleton style={{ width: 84, height: 20, borderRadius: "var(--tm-radius-pill)" }} />
            <Skeleton style={{ width: 96, height: 20, borderRadius: 4 }} />
          </div>
          {/* headline */}
          <Skeleton style={{ width: "92%", height: 34, borderRadius: 8 }} />
          <Skeleton style={{ width: "70%", height: 34, borderRadius: 8 }} />
          {/* summary */}
          <Skeleton style={{ width: "100%", height: 16, borderRadius: 4, marginTop: 8 }} />
          <Skeleton style={{ width: "85%", height: 16, borderRadius: 4 }} />
          {/* byline divider */}
          <Skeleton style={{ width: "100%", height: 52, borderRadius: 8, margin: "16px 0 24px" }} />
          {/* body lines */}
          {["100%", "96%", "98%", "60%"].map((w, i) => (
            <Skeleton key={i} style={{ width: w, height: 14, borderRadius: 4 }} />
          ))}
        </div>

        <aside className="nl-rail">
          <Skeleton style={{ width: "100%", height: 180, borderRadius: "var(--tm-radius-lg)" }} />
        </aside>
      </div>
    </div>
  )
}