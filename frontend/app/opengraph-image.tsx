import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "Myro — The Career Intelligence Platform"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Engine-dark palette (canonical DARK surface — matches the landing engine/readout
// console islands): teal #00f5d4 on near-black #0a0a0c. System fonts only, no
// remote font fetch (mirrors app/profile/[ninja]/opengraph-image.tsx).
const TEAL = "#00f5d4"
const INK = "#0a0a0c"
const TEXT = "#e8e8ea"
const MUTED = "#9aa4bf"
const FAINT = "#646e8c"

function StageNode({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "18px 30px",
        borderRadius: 14,
        background: "#13141a",
        border: "1px solid rgba(0,245,212,0.22)",
        fontSize: 28,
        fontWeight: 600,
        color: TEXT,
        letterSpacing: "-0.01em",
      }}
    >
      {label}
    </div>
  )
}

function FlowLine() {
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        height: 3,
        background: `linear-gradient(90deg, rgba(0,245,212,0.15), ${TEAL})`,
        borderRadius: 2,
      }}
    />
  )
}

export default function OpenGraphImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "68px 80px",
          background:
            `radial-gradient(1100px 700px at 18% 8%, #12131a 0%, ${INK} 58%, #060709 100%)`,
          color: TEXT,
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: `conic-gradient(from 210deg, ${TEAL}, #34ffe6, ${TEAL})`,
              boxShadow: "0 0 48px rgba(0,245,212,0.45)",
            }}
          />
          <div
            style={{
              fontSize: 38,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: TEXT,
            }}
          >
            Myro
          </div>
          <div
            style={{
              marginLeft: 14,
              padding: "7px 16px",
              borderRadius: 999,
              border: "1px solid rgba(0,245,212,0.30)",
              fontSize: 18,
              color: TEAL,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
            }}
          >
            the engine
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              fontSize: 74,
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: "-0.025em",
              color: TEXT,
              maxWidth: 1000,
            }}
          >
            The Career Intelligence Platform.
          </div>
          <div
            style={{
              fontSize: 28,
              lineHeight: 1.35,
              color: MUTED,
              maxWidth: 900,
            }}
          >
            Drop a CV. Get scored across 10 domains, matched to real jobs, and
            shown exactly what to build next.
          </div>
        </div>

        {/* Engine pipeline diagram */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <StageNode label="CV" />
          <FlowLine />
          <StageNode label="Skills" />
          <FlowLine />
          <StageNode label="Jobs" />
          <FlowLine />
          {/* Myro Score badge — pipeline output */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 118,
              height: 118,
              borderRadius: 999,
              background: "#13141a",
              border: `3px solid ${TEAL}`,
              boxShadow: "0 0 44px rgba(0,245,212,0.35)",
            }}
          >
            <div style={{ fontSize: 50, fontWeight: 700, color: TEAL }}>82</div>
            <div
              style={{
                fontSize: 13,
                color: FAINT,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              score
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 22,
            borderTop: "1px solid rgba(232,232,234,0.10)",
          }}
        >
          <div style={{ display: "flex", gap: 26, fontSize: 21, color: MUTED }}>
            <span>extract</span>
            <span style={{ color: "#3a4154" }}>·</span>
            <span>match</span>
            <span style={{ color: "#3a4154" }}>·</span>
            <span>score</span>
          </div>
          <div style={{ fontSize: 21, color: TEAL, fontWeight: 600 }}>himyro.com</div>
        </div>
      </div>
    ),
    { ...size },
  )
}
