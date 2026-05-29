/**
 * Teal edge-glow loader — the genuine "can't show a page skeleton yet" state.
 *
 * Used only where the destination is not yet known (e.g. the OAuth callback,
 * which decides /home vs /welcome only after the token exchange finishes), so
 * a layout-matched skeleton isn't possible. A full-bleed pulsing teal rim on
 * the brand background reads as "alive and working" without the immature
 * centered-spinner splash. Rebuild of the old teal-edge motif.
 */
export function EdgeGlow({ message = "Signing you in…" }: { message?: string }) {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--tm-bg)",
        color: "var(--tm-text-muted)",
        fontSize: 13,
        letterSpacing: "0.04em",
        fontFamily: "var(--tm-font-sans, var(--font-sans), sans-serif)",
      }}
    >
      {/* Pulsing teal rim — inset glow hugging the viewport edges. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          boxShadow: "inset 0 0 140px 8px var(--tm-int-bg-wash), inset 0 0 4px 1px var(--tm-int-border)",
          animation: "tm-edge-pulse 2400ms ease-in-out infinite",
        }}
      />
      <span style={{ position: "relative", animation: "tm-edge-text 2400ms ease-in-out infinite" }}>
        {message}
      </span>
      <style>{`
        @keyframes tm-edge-pulse {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 1; }
        }
        @keyframes tm-edge-text {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.9; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="tm-edge-pulse"], [style*="tm-edge-text"] { animation: none !important; }
        }
      `}</style>
    </main>
  )
}
