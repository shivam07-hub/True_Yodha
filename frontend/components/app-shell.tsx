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

const FEEDBACK_ACTIONS = [
  { id: "bug",       icon: "⚠",  label: "Report a bug",        color: "#FFB347", placeholder: "Describe what went wrong…" },
  { id: "companies", icon: "＋", label: "Add more companies",  color: "#00F5D4", placeholder: "Which companies should we track?" },
  { id: "feedback",  icon: "◎",  label: "Leave feedback",       color: "#A97FFF", placeholder: "What can we improve?" },
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

function AboutModal({ onClose }: { onClose: () => void }) {
  const howItWorks = [
    { n: "01", title: "Upload your CV",       body: "We extract every skill you've built across your career." },
    { n: "02", title: "We scan the market",   body: "Thousands of live job postings, parsed daily for what companies actually need." },
    { n: "03", title: "See your skill map",   body: "Your skills vs market demand — ranked, scored, and honest." },
    { n: "04", title: "Log daily progress",   body: "The Career Diary captures what you learn each day and credits your skills." },
    { n: "05", title: "Watch your score rise",body: "Your Truth Score grows as you close the gap. Every entry counts." },
  ]
  const values = [
    { icon: "◈", title: "Signal, not noise",              body: "We show you what companies are actually hiring for — not what feels good to hear. Radical transparency is non-negotiable." },
    { icon: "◉", title: "Human skills will always matter", body: "AGI is reshaping every industry. We're building the map that proves human skill depth never stops being valuable." },
    { icon: "◆", title: "Daily progress compounds",       body: "One diary entry. One skill tagged. One job studied. The platform tracks it all so nothing you learn is invisible." },
  ]
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(5,10,24,0.9)", backdropFilter: "blur(14px)" }} />
      <div style={{ position: "relative", background: "#080F20", border: "1px solid rgba(0,245,212,0.18)", borderRadius: 18, width: 580, maxHeight: "85vh", overflowY: "auto", zIndex: 1, boxShadow: "0 0 80px rgba(0,0,0,0.7)" }}
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: "32px 32px 24px", borderBottom: "1px solid rgba(0,245,212,0.08)", textAlign: "center", position: "relative" }}>
          <button onClick={onClose} style={{ position: "absolute", top: 20, right: 20, background: "transparent", border: "none", color: "rgba(240,244,255,0.35)", fontSize: 22, cursor: "pointer" }}>×</button>
          <div style={{ width: 44, height: 44, margin: "0 auto 16px", background: "linear-gradient(135deg,#00F5D4,#7B2FFF)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", filter: "drop-shadow(0 0 12px rgba(0,245,212,0.5))" }}>
            <TMLogo size={22} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#F0F4FF", letterSpacing: "-0.02em", marginBottom: 8 }}>Truth Mirror</h2>
          <p style={{ fontSize: 15, color: "rgba(240,244,255,0.6)", fontStyle: "italic" }}>See yourself clearly. For the first time.</p>
          <p style={{ fontSize: 12, color: "rgba(240,244,255,0.4)", marginTop: 10, lineHeight: 1.6, maxWidth: 420, margin: "10px auto 0" }}>
            {"The intelligence platform that reads what companies are actually hiring for — and shows you exactly where you stand, what's missing, and what to do next."}
          </p>
        </div>

        <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 28 }}>
          {/* Problem */}
          <div style={{ padding: "18px 20px", borderRadius: 12, background: "rgba(255,179,71,0.05)", border: "1px solid rgba(255,179,71,0.15)" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#FFB347", marginBottom: 10 }}>{"The Problem We're Solving"}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#F0F4FF", marginBottom: 12 }}>{"The job market doesn't tell you the truth."}</div>
            {["Companies know which exact skills they're hiring for. You're guessing.", "AI is reshaping every role. Nobody's telling you which human skills survive.", "Your CV is a story. The market wants a skill map."].map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#FFB347", marginTop: 5, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "rgba(240,244,255,0.6)", lineHeight: 1.6 }}>{t}</span>
              </div>
            ))}
          </div>

          {/* Mission */}
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(0,245,212,0.6)", marginBottom: 10 }}>Our Mission</div>
            <blockquote style={{ borderLeft: "3px solid #00F5D4", paddingLeft: 16, margin: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: "#F0F4FF", lineHeight: 1.7, marginBottom: 8 }}>
                Truth Mirror is the intelligence bridge between your skills and what the market actually needs — built on real hiring data from thousands of companies, updated daily.
              </p>
              <p style={{ fontSize: 12, color: "rgba(240,244,255,0.45)", lineHeight: 1.6 }}>
                Every feature — the skill match, the diary, the score — exists to close one gap: the distance between where you are and where the market needs you to be.
              </p>
            </blockquote>
          </div>

          {/* How it works */}
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(0,245,212,0.6)", marginBottom: 12 }}>How It Works</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {howItWorks.map((s) => (
                <div key={s.n} style={{ display: "flex", gap: 14, padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,245,212,0.5)", minWidth: 20, paddingTop: 1 }}>{s.n}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#F0F4FF", marginBottom: 2 }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: "rgba(240,244,255,0.45)", lineHeight: 1.5 }}>{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Vision */}
          <div style={{ padding: "18px 20px", borderRadius: 12, background: "rgba(123,47,255,0.06)", border: "1px solid rgba(123,47,255,0.15)" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#A97FFF", marginBottom: 10 }}>The Vision</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#F0F4FF", lineHeight: 1.4, marginBottom: 12 }}>Every person knows their exact position in the skills economy.</div>
            <p style={{ fontSize: 12, color: "rgba(240,244,255,0.5)", lineHeight: 1.6, marginBottom: 12 }}>Not a guess. Not a LinkedIn headline. A live, connected map of every skill you possess — and every skill the market is calling for next.</p>
            <div style={{ padding: "14px 16px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", fontSize: 12, color: "rgba(240,244,255,0.6)", lineHeight: 1.6, fontStyle: "italic" }}>
              {'"In a world where AGI is reshaping every industry, the only competitive advantage left is knowing exactly which human skills still matter — and having proof that you\'re building them."'}
            </div>
          </div>

          {/* Values */}
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(0,245,212,0.6)", marginBottom: 12 }}>What We Stand For</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {values.map((v) => (
                <div key={v.title} style={{ display: "flex", gap: 14, padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 16, color: "#00F5D4", minWidth: 22, paddingTop: 1, filter: "drop-shadow(0 0 4px rgba(0,245,212,0.5))" }}>{v.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#F0F4FF", marginBottom: 2 }}>{v.title}</div>
                    <div style={{ fontSize: 11, color: "rgba(240,244,255,0.45)", lineHeight: 1.5 }}>{v.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{ textAlign: "center", padding: "20px", borderRadius: 12, background: "linear-gradient(135deg,rgba(0,245,212,0.06),rgba(123,47,255,0.06))", border: "1px solid rgba(0,245,212,0.12)" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#F0F4FF", marginBottom: 6 }}>Look in the mirror.</div>
            <div style={{ fontSize: 12, color: "rgba(240,244,255,0.5)", marginBottom: 14 }}>See where you really stand. Then do something about it.</div>
            <button onClick={onClose} style={{ padding: "10px 28px", borderRadius: 999, background: "rgba(0,245,212,0.15)", border: "1px solid rgba(0,245,212,0.35)", color: "#00F5D4", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              Back to the platform →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeedbackModal({ action, onClose }: { action: typeof FEEDBACK_ACTIONS[0]; onClose: () => void }) {
  const [text, setText] = useState("")
  const [sent, setSent] = useState(false)
  const submit = () => {
    if (text.trim()) { setSent(true); setTimeout(onClose, 1400) }
  }
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "flex-start", padding: "0 0 80px 72px" }}
      onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(5,10,24,0.5)", backdropFilter: "blur(6px)" }} />
      <div style={{ position: "relative", background: "#0C1428", border: `1px solid ${action.color}30`, borderRadius: 14, padding: 20, width: 300, zIndex: 1, boxShadow: `0 0 40px rgba(0,0,0,0.5)` }}
        onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 8, filter: `drop-shadow(0 0 8px ${action.color})`, color: action.color }}>✓</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#F0F4FF" }}>Thanks — received!</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 16, color: action.color, filter: `drop-shadow(0 0 4px ${action.color})` }}>{action.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#F0F4FF" }}>{action.label}</span>
              <button onClick={onClose} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "rgba(240,244,255,0.35)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={action.placeholder}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${action.color}25`, color: "#F0F4FF", fontSize: 12, lineHeight: 1.6, resize: "none", minHeight: 80, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            <button onClick={submit} style={{ marginTop: 10, width: "100%", padding: "9px", borderRadius: 8, background: `${action.color}18`, border: `1px solid ${action.color}35`, color: action.color, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              Send →
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function UserFooter({ expanded }: { expanded: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<typeof FEEDBACK_ACTIONS[0] | null>(null)
  const [showAbout, setShowAbout] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)
  const { signOut } = useAuth()

  const extraActions = [
    { id: "about",   icon: "◎", label: "About Truth Mirror", color: "#00F5D4" },
    { id: "signout", icon: "→", label: "Sign out",            color: "rgba(240,244,255,0.4)" },
  ]

  const handleExtra = (id: string) => {
    setMenuOpen(false)
    if (id === "about") setShowAbout(true)
    if (id === "signout") setSignOutConfirm(true)
  }

  return (
    <>
      <div style={{ borderTop: "1px solid rgba(0,245,212,0.06)", position: "relative" }}>
        {/* Menu flies up above the user row */}
        {expanded && menuOpen && (
          <div style={{ padding: "8px 8px 0", display: "flex", flexDirection: "column", gap: 2 }}>
            {FEEDBACK_ACTIONS.map((a) => (
              <button key={a.id} onClick={() => { setActiveModal(a); setMenuOpen(false) }} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s", width: "100%",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `${a.color}0d`; e.currentTarget.style.borderColor = `${a.color}25` }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 13, color: a.color, minWidth: 18, textAlign: "center", filter: `drop-shadow(0 0 3px ${a.color}80)` }}>{a.icon}</span>
                <span style={{ fontSize: 12, color: "rgba(240,244,255,0.65)" }}>{a.label}</span>
              </button>
            ))}
            <div style={{ height: 1, background: "rgba(0,245,212,0.06)", margin: "4px 0" }} />
            {extraActions.map((a) => (
              <button key={a.id} onClick={() => handleExtra(a.id)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
                background: "transparent", border: "1px solid transparent",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s", width: "100%",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = a.id === "signout" ? "rgba(255,80,80,0.06)" : "rgba(0,245,212,0.05)" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}>
                <span style={{ fontSize: 13, color: a.id === "signout" ? "rgba(255,120,120,0.7)" : a.color, minWidth: 18, textAlign: "center" }}>{a.icon}</span>
                <span style={{ fontSize: 12, color: a.id === "signout" ? "rgba(255,120,120,0.7)" : "rgba(240,244,255,0.65)" }}>{a.label}</span>
              </button>
            ))}
            <div style={{ height: 1, background: "rgba(0,245,212,0.06)", margin: "4px 0 0" }} />
          </div>
        )}

        {/* Avatar row */}
        <div
          onClick={() => expanded && setMenuOpen((o) => !o)}
          style={{ padding: "10px 8px", display: "flex", alignItems: "center", gap: 10, cursor: expanded ? "pointer" : "default" }}
          onMouseEnter={(e) => { if (expanded) e.currentTarget.style.background = "rgba(255,255,255,0.03)" }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
        >
          <div style={{
            width: 32, height: 32, minWidth: 32, borderRadius: "50%",
            background: menuOpen
              ? "linear-gradient(135deg,rgba(0,245,212,0.5),rgba(123,47,255,0.4))"
              : "linear-gradient(135deg,rgba(123,47,255,0.5),rgba(0,245,212,0.4))",
            border: `1px solid ${menuOpen ? "rgba(0,245,212,0.5)" : "rgba(0,245,212,0.3)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#F0F4FF",
            transition: "all 0.2s",
            boxShadow: menuOpen ? "0 0 12px rgba(0,245,212,0.3)" : "none",
          }}>TM</div>
          <div style={{ opacity: expanded ? 1 : 0, transition: "opacity 0.18s", overflow: "hidden", whiteSpace: "nowrap", flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#F0F4FF" }}>My Account</div>
            <div style={{ fontSize: 10, color: "rgba(240,244,255,0.38)" }}>Options ↑</div>
          </div>
          {expanded && (
            <div style={{ fontSize: 10, color: "rgba(240,244,255,0.25)", transition: "transform 0.2s", transform: menuOpen ? "rotate(180deg)" : "none", marginRight: 4 }}>▴</div>
          )}
        </div>
      </div>

      {activeModal && <FeedbackModal action={activeModal} onClose={() => setActiveModal(null)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      {signOutConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setSignOutConfirm(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(5,10,24,0.8)", backdropFilter: "blur(10px)" }} />
          <div style={{
            position: "relative", background: "#0C1428",
            border: "1px solid rgba(255,100,100,0.2)", borderRadius: 14,
            padding: "28px", width: 340, zIndex: 1, textAlign: "center",
          }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 28, marginBottom: 12, color: "rgba(240,244,255,0.5)" }}>→</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#F0F4FF", marginBottom: 6 }}>Sign out?</div>
            <div style={{ fontSize: 12, color: "rgba(240,244,255,0.45)", marginBottom: 24, lineHeight: 1.6 }}>
              Your progress is saved. You can sign back in anytime to resume your journey.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setSignOutConfirm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(240,244,255,0.6)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={signOut} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.25)", color: "rgba(255,130,130,0.9)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Sidebar({ score, onLogoClick }: { score: number | null; onLogoClick: () => void }) {
  const [expanded, setExpanded] = useState(false)
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
      {/* Logo — click → AboutModal */}
      <div
        onClick={onLogoClick}
        style={{
          padding: "22px 16px 20px",
          display: "flex", alignItems: "center", gap: 12,
          borderBottom: "1px solid rgba(0,245,212,0.06)",
          minHeight: 76, cursor: "pointer",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,245,212,0.03)" }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
      >
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
        margin: "10px 8px", padding: "10px 12px", borderRadius: 10,
        background: "rgba(0,245,212,0.06)", border: "1px solid rgba(0,245,212,0.14)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{ minWidth: 32, textAlign: "center", fontSize: 18, fontWeight: 700, color: "#00F5D4", lineHeight: 1, filter: "drop-shadow(0 0 6px rgba(0,245,212,0.7))" }}>
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
                display: "flex", alignItems: "center", gap: 12,
                padding: "9px 8px", borderRadius: 8,
                background: active ? "rgba(0,245,212,0.08)" : "transparent",
                boxShadow: active ? "inset 3px 0 0 #00F5D4" : "none",
                transition: "all 0.2s", textDecoration: "none",
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)" }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent" }}
            >
              <span style={{
                fontSize: 17, minWidth: 32, textAlign: "center",
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

      <UserFooter expanded={expanded} />
    </nav>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuth()
  const [showAbout, setShowAbout] = useState(false)

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
      <Sidebar score={scoreData?.total_score ?? null} onLogoClick={() => setShowAbout(true)} />
      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", zIndex: 2 }}>
        <div className="page-enter" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {children}
        </div>
      </main>
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  )
}
