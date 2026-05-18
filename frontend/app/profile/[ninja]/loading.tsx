export default function Loading() {
  return (
    <main
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "48px 24px",
        color: "var(--tm-text)",
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
        Myro · Domain Map
      </div>
      <div
        style={{
          height: 28,
          width: 220,
          marginTop: 8,
          marginBottom: 28,
          background: "var(--tm-surface-2)",
          borderRadius: 8,
        }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 24,
        }}
      >
        <div
          style={{
            height: 380,
            background: "var(--tm-surface-2)",
            border: "1px solid var(--tm-border)",
            borderRadius: 16,
          }}
        />
        <div
          style={{
            height: 380,
            background: "var(--tm-surface-2)",
            border: "1px solid var(--tm-border)",
            borderRadius: 16,
          }}
        />
      </div>
    </main>
  )
}
