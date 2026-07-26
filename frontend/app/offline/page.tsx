import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Offline — Myro",
  robots: { index: false, follow: false },
}

// Served from the service-worker cache when a navigation fails offline. Styles
// are inline + self-contained on purpose: the global CSS chunk may not be
// cached, so this shell must render correctly with zero external stylesheet.
// Theme-aware via prefers-color-scheme to match the two-brand surface system.
export default function OfflinePage() {
  return (
    <main
      className="myro-offline-wrap"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: "40px 24px",
        textAlign: "center",
        fontFamily:
          "var(--tm-font-sans, 'Space Grotesk', system-ui, -apple-system, sans-serif)",
      }}
    >
      <style>{`
        /* Inline + hardcoded by design: this shell must paint with zero
           network, so it cannot import design-tokens.css. Values mirror the
           canonical :root ramp by hand — update both together. */
        .myro-offline-wrap{background:#faf6f0;color:#29241e}
        .myro-offline-sub{color:#6e655a}
        @media (prefers-color-scheme: dark){
          .myro-offline-wrap{background:#191918;color:#f2f2ee}
          .myro-offline-sub{color:#a6a69e}
        }
      `}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/icon-192.png" alt="Myro" width={64} height={64} style={{ borderRadius: 16 }} />
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>You&rsquo;re offline</h1>
      <p className="myro-offline-sub" style={{ fontSize: 15, lineHeight: 1.5, margin: 0, maxWidth: 320 }}>
        Myro needs a connection to score your CV and pull live job matches. Reconnect and try again.
      </p>
    </main>
  )
}
