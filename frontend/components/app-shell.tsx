"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { scores } from "@/lib/api"
import { ParticleBg } from "@/components/particle-bg"

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard",  desc: "Overview & analytics",     icon: "▣" },
  { href: "/cv",        label: "CV Skills",  desc: "Your skill profile",        icon: "◈" },
  { href: "/market",    label: "Intel",      desc: "Market intelligence",       icon: "◉" },
  { href: "/tracker",   label: "Jobs",       desc: "Matched roles + tracker",   icon: "◆" },
  { href: "/diary",     label: "Progress",   desc: "Diary & achievements",      icon: "◑" },
]

function TMLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2.5L4 6v6c0 4.8 3.6 9 8 10.5C16.4 21 20 16.8 20 12V6L12 2.5Z"
        stroke="#00F5D4" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M12 2.5L4 6v6c0 4.8 3.6 9 8 10.5V2.5Z" fill="#00F5D4" opacity="0.85" />
      <path d="M12 2.5L20 6v6c0 4.8-3.6 9-8 10.5V2.5Z" fill="#00F5D4" opacity="0.2" />
      <line x1="12" y1="2.5" x2="12" y2="22" stroke="#00F5D4" strokeWidth="0.8" opacity="0.6" />
    </svg>
  )
}

function Sidebar({ score }: { score: number | null }) {
  const [expanded, setExpanded] = useState(false)
  const [showSignOut, setShowSignOut] = useState(false)
  const { signOut } = useAuth()
  const pathname = usePathname()

  return (
    <nav
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        width: expanded ? 220 : 64,
        transition: "width 0.32s cubic-bezier(0.16,1,0.3,1)",
        height: "100vh",
        flexShrink: 0,
        background: "rgba(5,10,24,0.97)",
        borderRight: "1px solid rgba(0,245,212,0.07)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 20,
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div style={{
        padding: "22px 16px 20px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderBottom: "1px solid rgba(0,245,212,0.06)",
        minHeight: 76,
      }}>
        <div style={{ minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center", filter: "drop-shadow(0 0 8px rgba(0,245,212,0.5))" }}>
          <TMLogo />
        </div>
        <div style={{ opacity: expanded ? 1 : 0, transition: "opacity 0.18s", whiteSpace: "nowrap", overflow: "hidden" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#F0F4FF", letterSpacing: "-0.01em" }}>Truth Mirror</div>
          <div style={{ fontSize: 9, color: "rgba(240,244,255,0.38)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>Career Intelligence</div>
        </div>
      </div>

      {/* Truth Score pill */}
      <div style={{
        margin: "10px 8px",
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(0,245,212,0.06)",
        border: "1px solid rgba(0,245,212,0.14)",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <div style={{
          minWidth: 32,
          textAlign: "center",
          fontSize: 18,
          fontWeight: 700,
          color: "#00F5D4",
          lineHeight: 1,
          filter: "drop-shadow(0 0 6px rgba(0,245,212,0.7))",
        }}>
          {score !== null ? Math.round(score) : "—"}
        </div>
        <div style={{ opacity: expanded ? 1 : 0, transition: "opacity 0.18s", whiteSpace: "nowrap" }}>
          <div style={{ fontSize: 9, color: "rgba(240,244,255,0.38)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Truth Score</div>
          <div style={{ fontSize: 11, color: "#00F5D4", marginTop: 2 }}>Your market position</div>
        </div>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, padding: "8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 8px",
                borderRadius: 8,
                background: active ? "rgba(0,245,212,0.08)" : "transparent",
                boxShadow: active ? "inset 3px 0 0 #00F5D4" : "none",
                transition: "all 0.2s",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)" }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent" }}
            >
              <span style={{
                fontSize: 17,
                minWidth: 32,
                textAlign: "center",
                color: active ? "#00F5D4" : "rgba(240,244,255,0.38)",
                filter: active ? "drop-shadow(0 0 5px rgba(0,245,212,0.9))" : "none",
                transition: "all 0.2s",
              }}>
                {item.icon}
              </span>
              <div style={{ opacity: expanded ? 1 : 0, transition: "opacity 0.18s", overflow: "hidden", whiteSpace: "nowrap" }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: active ? "#00F5D4" : "#F0F4FF" }}>{item.label}</div>
                <div style={{ fontSize: 10, color: "rgba(240,244,255,0.33)", marginTop: 1 }}>{item.desc}</div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* User footer */}
      <div style={{ borderTop: "1px solid rgba(0,245,212,0.06)" }}>
        <div
          style={{ padding: "10px 8px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          onClick={() => expanded && setShowSignOut(true)}
          onMouseEnter={(e) => { if (expanded) e.currentTarget.style.background = "rgba(255,255,255,0.03)" }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
        >
          <div style={{
            width: 32, height: 32, minWidth: 32, borderRadius: "50%",
            background: "linear-gradient(135deg,rgba(123,47,255,0.5),rgba(0,245,212,0.4))",
            border: "1px solid rgba(0,245,212,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#F0F4FF",
          }}>TM</div>
          <div style={{ opacity: expanded ? 1 : 0, transition: "opacity 0.18s", overflow: "hidden", whiteSpace: "nowrap" }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#F0F4FF" }}>My Account</div>
            <div style={{ fontSize: 10, color: "rgba(240,244,255,0.38)" }}>Sign out →</div>
          </div>
        </div>
      </div>

      {/* Sign out confirmation */}
      {showSignOut && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowSignOut(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "rgba(5,10,24,0.8)", backdropFilter: "blur(10px)" }} />
          <div
            style={{
              position: "relative", background: "#0C1428",
              border: "1px solid rgba(255,100,100,0.2)", borderRadius: 14,
              padding: "28px", width: 340, zIndex: 1, textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 28, marginBottom: 12, color: "rgba(240,244,255,0.5)" }}>→</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#F0F4FF", marginBottom: 6 }}>Sign out?</div>
            <div style={{ fontSize: 12, color: "rgba(240,244,255,0.45)", marginBottom: 24, lineHeight: 1.6 }}>
              Your progress is saved. Sign back in anytime.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowSignOut(false)}
                style={{ flex: 1, padding: "10px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(240,244,255,0.6)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
              >
                Cancel
              </button>
              <button
                onClick={signOut}
                style={{ flex: 1, padding: "10px", borderRadius: 10, background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.25)", color: "rgba(255,130,130,0.9)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuth()

  const { data: scoreData } = useQuery({
    queryKey: ["scores", token],
    queryFn: () => scores.me(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  if (!ready) return null

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", position: "relative" }}>
      <ParticleBg />
      <Sidebar score={scoreData?.total_score ?? null} />
      <main
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div className="page-enter" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {children}
        </div>
      </main>
    </div>
  )
}
