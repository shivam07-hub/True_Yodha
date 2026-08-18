/**
 * Extension handshake wait — plain canvas status, no ambient TealField. The
 * extension tab closes as soon as tokens land in the fragment; a shaped app
 * skeleton would flash for milliseconds and read as a wrong destination.
 */
export function ExtensionConnectStatus({ message }: { message: string }) {
  return (
    <main
      className="tm-page-canvas"
      role="status"
      aria-live="polite"
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          maxWidth: 320,
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--tm-text-muted)",
          fontFamily: "var(--tm-font-sans)",
        }}
      >
        {message}
      </p>
    </main>
  )
}
