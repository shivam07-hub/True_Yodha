import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "Myro — one hub for every CV version"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

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
          padding: "72px 80px",
          background:
            "radial-gradient(1100px 700px at 20% 10%, #1A1D24 0%, #0B0D11 55%, #060709 100%)",
          color: "#F4F7FA",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background:
                "conic-gradient(from 220deg, #FF6B2C, #FFA94D, #FF6B2C)",
              boxShadow: "0 0 60px rgba(255,107,44,0.45)",
            }}
          />
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#F4F7FA",
            }}
          >
            Myro
          </div>
          <div
            style={{
              marginLeft: 16,
              padding: "8px 16px",
              borderRadius: 999,
              border: "1px solid rgba(244,247,250,0.18)",
              fontSize: 20,
              color: "#A8B3C5",
              letterSpacing: "0.04em",
            }}
          >
            career intelligence
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              color: "#F4F7FA",
              maxWidth: 980,
            }}
          >
            One hub for every CV version.
          </div>
          <div
            style={{
              fontSize: 30,
              lineHeight: 1.35,
              color: "#C7D0DE",
              maxWidth: 880,
            }}
          >
            Save your master CV, tailor versions for internships and jobs, and
            know which resume to send next.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 24,
            borderTop: "1px solid rgba(244,247,250,0.12)",
          }}
        >
          <div style={{ display: "flex", gap: 28, fontSize: 22, color: "#A8B3C5" }}>
            <span>master</span>
            <span style={{ color: "#3F4655" }}>·</span>
            <span>tailored</span>
            <span style={{ color: "#3F4655" }}>·</span>
            <span>scored</span>
          </div>
          <div style={{ fontSize: 22, color: "#FF6B2C", fontWeight: 600 }}>
            himyro.com
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
