"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { scores, users } from "@/lib/api"
import { ParticleBg } from "@/components/particle-bg"
import { AccentToggle } from "@/components/accent-toggle"

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", desc: "Overview & analytics",   icon: "▣", nudge: false },
  { href: "/cv",        label: "CV Skills", desc: "Your skill profile",      icon: "◈", nudge: false },
  { href: "/market",    label: "Intel",     desc: "Market intelligence",     icon: "◉", nudge: false },
  { href: "/tracker",   label: "Jobs",      desc: "Matched roles + tracker", icon: "◆", nudge: false },
  { href: "/diary",     label: "Progress",  desc: "Diary & achievements",    icon: "◑", nudge: true  },
]

const FEEDBACK_ACTIONS = [
  { id: "bug",       icon: "⚠",  label: "Report a bug",       color: "var(--tm-warning)", bg: "var(--tm-warning-wash)", placeholder: "Describe what went wrong…"          },
  { id: "companies", icon: "＋", label: "Add more companies", color: "var(--tm-accent)",  bg: "var(--tm-accent-wash)",  placeholder: "Which companies should we track?"    },
  { id: "feedback",  icon: "◎",  label: "Leave feedback",     color: "var(--tm-success)", bg: "var(--tm-success-wash)", placeholder: "What can we improve?"                },
]

function TMLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ color: "var(--tm-accent)" }}
    >
      <path
        d="M12 2.5L4 6v6c0 4.8 3.6 9 8 10.5C16.4 21 20 16.8 20 12V6L12 2.5Z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
      />
      <path d="M12 2.5L4 6v6c0 4.8 3.6 9 8 10.5V2.5Z" fill="currentColor" opacity="0.85" />
      <path d="M12 2.5L20 6v6c0 4.8-3.6 9-8 10.5V2.5Z" fill="currentColor" opacity="0.2" />
      <line x1="12" y1="2.5" x2="12" y2="22" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
    </svg>
  )
}

function AboutModal({ onClose }: { onClose: () => void }) {
  const howItWorks = [
    { n: "01", title: "Upload your CV",        body: "We extract every skill you've built across your career." },
    { n: "02", title: "We scan the market",    body: "Thousands of live job postings, parsed daily for what companies actually need." },
    { n: "03", title: "See your skill map",    body: "Your skills vs market demand — ranked, scored, and honest." },
    { n: "04", title: "Log daily progress",    body: "The Career Diary captures what you learn each day and credits your skills." },
    { n: "05", title: "Watch your score rise", body: "Your Truth Score grows as you close the gap. Every entry counts." },
  ]
  const values = [
    { icon: "◈", title: "Signal, not noise",               body: "We show you what companies are actually hiring for — not what feels good to hear. Radical transparency is non-negotiable." },
    { icon: "◉", title: "Human skills will always matter", body: "AGI is reshaping every industry. We're building the map that proves human skill depth never stops being valuable." },
    { icon: "◆", title: "Daily progress compounds",        body: "One diary entry. One skill tagged. One job studied. The platform tracks it all so nothing you learn is invisible." },
  ]

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div style={{ position: "absolute", inset: 0, background: "var(--tm-scrim)", backdropFilter: "blur(14px)" }} />
      <div
        style={{
          position: "relative",
          background: "var(--tm-surface)",
          border: "1px solid var(--tm-accent-ring)",
          borderRadius: "var(--tm-radius-xl)",
          width: 580, maxHeight: "85vh", overflowY: "auto",
          zIndex: 1,
          boxShadow: "0 0 80px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "32px 32px 24px", borderBottom: "1px solid var(--tm-border-soft)", textAlign: "center", position: "relative" }}>
          <button
            onClick={onClose}
            style={{ position: "absolute", top: 20, right: 20, background: "transparent", border: "none", color: "var(--tm-text-faint)", fontSize: 23, cursor: "pointer" }}
          >×</button>
          <div style={{
            width: 44, height: 44, margin: "0 auto 16px",
            background: "linear-gradient(135deg, var(--tm-accent), var(--tm-accent-pressed))",
            borderRadius: "var(--tm-radius)",
            display: "flex", alignItems: "center", justifyContent: "center",
            filter: "drop-shadow(0 0 12px var(--tm-accent-glow))",
          }}>
            <TMLogo size={22} />
          </div>
          <h2 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 700, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", marginBottom: 8 }}>
            Truth Mirror
          </h2>
          <p style={{ fontSize: 16, color: "var(--tm-text-muted)", fontStyle: "italic" }}>
            See yourself clearly. For the first time.
          </p>
          <p style={{ fontSize: 13, color: "var(--tm-text-faint)", marginTop: 10, lineHeight: 1.6, maxWidth: 420, margin: "10px auto 0" }}>
            {"The intelligence platform that reads what companies are actually hiring for — and shows you exactly where you stand, what's missing, and what to do next."}
          </p>
        </div>

        <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 28 }}>
          {/* Problem */}
          <div style={{ padding: "18px 20px", borderRadius: "var(--tm-radius)", background: "var(--tm-warning-wash)", border: "1px solid var(--tm-border)" }}>
            <div className="tm-label-caps" style={{ color: "var(--tm-warning)", marginBottom: 10 }}>{"The Problem We're Solving"}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 12 }}>
              {"The job market doesn't tell you the truth."}
            </div>
            {[
              "Companies know which exact skills they're hiring for. You're guessing.",
              "AI is reshaping every role. Nobody's telling you which human skills survive.",
              "Your CV is a story. The market wants a skill map.",
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--tm-warning)", marginTop: 5, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.6 }}>{t}</span>
              </div>
            ))}
          </div>

          {/* Mission */}
          <div>
            <div className="tm-label-caps" style={{ marginBottom: 10 }}>Our Mission</div>
            <blockquote style={{ borderLeft: "3px solid var(--tm-accent)", paddingLeft: 16, margin: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 500, color: "var(--tm-text)", lineHeight: 1.7, marginBottom: 8 }}>
                Truth Mirror is the intelligence bridge between your skills and what the market actually needs — built on real hiring data from thousands of companies, updated daily.
              </p>
              <p style={{ fontSize: 13, color: "var(--tm-text-faint)", lineHeight: 1.6 }}>
                Every feature — the skill match, the diary, the score — exists to close one gap: the distance between where you are and where the market needs you to be.
              </p>
            </blockquote>
          </div>

          {/* How it works */}
          <div>
            <div className="tm-label-caps" style={{ marginBottom: 12 }}>How It Works</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {howItWorks.map((s) => (
                <div key={s.n} style={{ display: "flex", gap: 14, padding: "12px 16px", borderRadius: "var(--tm-radius)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tm-text-faint)", minWidth: 20, paddingTop: 1 }}>{s.n}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)", marginBottom: 2 }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.5 }}>{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Vision */}
          <div style={{ padding: "18px 20px", borderRadius: "var(--tm-radius)", background: "var(--tm-surface-2)", border: "1px solid var(--tm-border)" }}>
            <div className="tm-label-caps" style={{ marginBottom: 10 }}>The Vision</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.4, marginBottom: 12 }}>
              Every person knows their exact position in the skills economy.
            </div>
            <p style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.6, marginBottom: 12 }}>
              Not a guess. Not a LinkedIn headline. A live, connected map of every skill you possess — and every skill the market is calling for next.
            </p>
            <div style={{ padding: "14px 16px", borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.03)", border: "1px solid var(--tm-border-soft)", fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.6, fontStyle: "italic" }}>
              {'"In a world where AGI is reshaping every industry, the only competitive advantage left is knowing exactly which human skills still matter — and having proof that you\'re building them."'}
            </div>
          </div>

          {/* Values */}
          <div>
            <div className="tm-label-caps" style={{ marginBottom: 12 }}>What We Stand For</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {values.map((v) => (
                <div key={v.title} style={{ display: "flex", gap: 14, padding: "12px 16px", borderRadius: "var(--tm-radius)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)" }}>
                  <div style={{ fontSize: 17, color: "var(--tm-accent)", minWidth: 22, paddingTop: 1, filter: "drop-shadow(0 0 4px var(--tm-accent-glow))" }}>{v.icon}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)", marginBottom: 2 }}>{v.title}</div>
                    <div style={{ fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.5 }}>{v.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{ textAlign: "center", padding: "20px", borderRadius: "var(--tm-radius)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)" }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: "var(--tm-text)", marginBottom: 6 }}>Look in the mirror.</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-muted)", marginBottom: 14 }}>See where you really stand. Then do something about it.</div>
            <button
              onClick={onClose}
              className="tm-btn tm-btn-ghost"
            >
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
    <div
      style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "flex-start", padding: "0 0 80px 72px" }}
      onClick={onClose}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(5,10,24,0.5)", backdropFilter: "blur(6px)" }} />
      <div
        style={{
          position: "relative",
          background: "var(--tm-surface)",
          border: `1px solid ${action.bg}`,
          borderRadius: "var(--tm-radius-lg)",
          padding: 20, width: 300, zIndex: 1,
          boxShadow: "0 0 40px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {sent ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 29, marginBottom: 8, filter: `drop-shadow(0 0 8px ${action.color})`, color: action.color }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)" }}>Thanks — received!</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 17, color: action.color, filter: `drop-shadow(0 0 4px ${action.color})` }}>{action.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)" }}>{action.label}</span>
              <button
                onClick={onClose}
                style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--tm-text-faint)", fontSize: 19, cursor: "pointer", lineHeight: 1 }}
              >×</button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={action.placeholder}
              style={{
                width: "100%", padding: "10px 12px",
                borderRadius: "var(--tm-radius-sm)",
                background: "var(--tm-surface-2)",
                border: `1px solid ${action.bg}`,
                color: "var(--tm-text)", fontSize: 13, lineHeight: 1.6,
                resize: "none", minHeight: 80, fontFamily: "inherit",
                outline: "none", boxSizing: "border-box",
              }}
            />
            <button
              onClick={submit}
              style={{
                marginTop: 10, width: "100%", padding: "9px",
                borderRadius: "var(--tm-radius-sm)",
                background: action.bg,
                border: `1px solid ${action.color}`,
                color: action.color, fontSize: 13, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Send →
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function UserFooter({ expanded, fullName }: { expanded: boolean; fullName: string | null }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<typeof FEEDBACK_ACTIONS[0] | null>(null)
  const [showAbout, setShowAbout] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)
  const { signOut } = useAuth()

  const extraActions = [
    { id: "about",   icon: "◎", label: "About Truth Mirror", color: "var(--tm-accent)",     hoverBg: "var(--tm-accent-wash)" },
    { id: "signout", icon: "→", label: "Sign out",           color: "rgba(255,120,120,0.7)", hoverBg: "rgba(255,80,80,0.06)" },
  ]

  const handleExtra = (id: string) => {
    setMenuOpen(false)
    if (id === "about") setShowAbout(true)
    if (id === "signout") setSignOutConfirm(true)
  }

  return (
    <>
      <div style={{ borderTop: "1px solid var(--tm-border-soft)", position: "relative" }}>
        {expanded && menuOpen && (
          <div style={{ padding: "8px 8px 0", display: "flex", flexDirection: "column", gap: 2 }}>
            {FEEDBACK_ACTIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => { setActiveModal(a); setMenuOpen(false) }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  borderRadius: "var(--tm-radius-sm)",
                  background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)",
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  transition: "all var(--tm-dur-fast) var(--tm-ease)", width: "100%",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = a.bg; e.currentTarget.style.borderColor = a.color }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
              >
                <span style={{ fontSize: 14, color: a.color, minWidth: 18, textAlign: "center", filter: `drop-shadow(0 0 3px ${a.color})` }}>{a.icon}</span>
                <span style={{ fontSize: 13, color: "var(--tm-text-muted)" }}>{a.label}</span>
              </button>
            ))}
            <div style={{ height: 1, background: "var(--tm-border-soft)", margin: "4px 0" }} />
            {extraActions.map((a) => (
              <button
                key={a.id}
                onClick={() => handleExtra(a.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  borderRadius: "var(--tm-radius-sm)",
                  background: "transparent", border: "1px solid transparent",
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  transition: "all var(--tm-dur-fast) var(--tm-ease)", width: "100%",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = a.hoverBg }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
              >
                <span style={{ fontSize: 14, color: a.color, minWidth: 18, textAlign: "center" }}>{a.icon}</span>
                <span style={{ fontSize: 13, color: a.color }}>{a.label}</span>
              </button>
            ))}
            <div style={{ height: 1, background: "var(--tm-border-soft)", margin: "4px 0 0" }} />
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
              ? "linear-gradient(135deg, var(--tm-accent-wash), var(--tm-accent-ring))"
              : "linear-gradient(135deg, var(--tm-border), var(--tm-accent-wash))",
            border: `1px solid ${menuOpen ? "var(--tm-accent-ring)" : "var(--tm-border)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700, color: "var(--tm-text)",
            transition: "all var(--tm-dur) var(--tm-ease)",
            boxShadow: menuOpen ? "0 0 12px var(--tm-accent-glow)" : "none",
          }}>{fullName ? fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "TM"}</div>
          <div style={{ opacity: expanded ? 1 : 0, transition: `opacity var(--tm-dur)`, overflow: "hidden", whiteSpace: "nowrap", flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--tm-text)" }}>{fullName ?? "My Account"}</div>
          </div>
          {expanded && (
            <div style={{ fontSize: 11, color: "var(--tm-text-faint)", transition: `transform var(--tm-dur)`, transform: menuOpen ? "rotate(180deg)" : "none", marginRight: 4 }}>▴</div>
          )}
        </div>
      </div>

      {activeModal && <FeedbackModal action={activeModal} onClose={() => setActiveModal(null)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      {signOutConfirm && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setSignOutConfirm(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--tm-scrim)", backdropFilter: "blur(10px)" }} />
          <div
            style={{
              position: "relative", background: "var(--tm-surface)",
              border: "1px solid rgba(255,100,100,0.2)", borderRadius: "var(--tm-radius-lg)",
              padding: "28px", width: 340, zIndex: 1, textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 29, marginBottom: 12, color: "var(--tm-text-muted)" }}>→</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 6 }}>Sign out?</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-muted)", marginBottom: 24, lineHeight: 1.6 }}>
              Your progress is saved. You can sign back in anytime to resume your journey.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setSignOutConfirm(false)}
                style={{ flex: 1, padding: "10px", borderRadius: "var(--tm-radius)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border)", color: "var(--tm-text-muted)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >
                Cancel
              </button>
              <button
                onClick={signOut}
                style={{ flex: 1, padding: "10px", borderRadius: "var(--tm-radius)", background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.25)", color: "rgba(255,130,130,0.9)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Sidebar({ score, fullName, onLogoClick }: { score: number | null; fullName: string | null; onLogoClick: () => void }) {
  const expanded = true
  const pathname = usePathname()

  return (
    <nav
      style={{
        width: 220,
        height: "100vh",
        flexShrink: 0,
        background: "rgba(5,10,24,0.97)",
        borderRight: "1px solid var(--tm-border-soft)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 20,
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div
        onClick={onLogoClick}
        style={{
          padding: "22px 16px 20px",
          display: "flex", alignItems: "center", gap: 12,
          borderBottom: "1px solid var(--tm-border-soft)",
          minHeight: 76, cursor: "pointer",
          transition: "background var(--tm-dur) var(--tm-ease)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-accent-wash)" }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
      >
        <div style={{ minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center", filter: "drop-shadow(0 0 8px var(--tm-accent-glow))" }}>
          <TMLogo />
        </div>
        <div style={{ opacity: expanded ? 1 : 0, transition: `opacity var(--tm-dur)`, whiteSpace: "nowrap", overflow: "hidden" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)" }}>Truth Mirror</div>
          <div className="tm-label-caps" style={{ marginTop: 2, fontSize: 10 }}>Career Intelligence</div>
        </div>
      </div>

      {/* Truth Score pill */}
      <div style={{
        margin: "10px 8px", padding: "10px 12px",
        borderRadius: "var(--tm-radius)",
        background: "var(--tm-accent-wash)",
        border: "1px solid var(--tm-accent-ring)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          minWidth: 32, textAlign: "center",
          fontFamily: "var(--tm-font-mono)",
          fontSize: 19, fontWeight: 700,
          color: "var(--tm-text)", lineHeight: 1,
          filter: "drop-shadow(0 0 6px var(--tm-accent-glow))",
        }}>
          {score !== null ? Math.round(score) : "—"}
        </div>
        <div style={{ opacity: expanded ? 1 : 0, transition: `opacity var(--tm-dur)`, whiteSpace: "nowrap" }}>
          <div className="tm-label-caps" style={{ fontSize: 10 }}>Truth Score</div>
          <div style={{ fontSize: 12, color: "var(--tm-text-muted)", marginTop: 2 }}>Market position</div>
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
                padding: "9px 8px", borderRadius: "var(--tm-radius-sm)",
                background: active ? "var(--tm-accent-wash)" : "transparent",
                boxShadow: active ? "inset 3px 0 0 var(--tm-accent)" : "none",
                transition: "all var(--tm-dur) var(--tm-ease)",
                textDecoration: "none",
                position: "relative",
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)" }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent" }}
            >
              {/* Icon + nudge dot container */}
              <span style={{ position: "relative", minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{
                  fontSize: 18,
                  color: active ? "var(--tm-accent)" : "rgba(240,244,255,0.38)",
                  filter: active ? "drop-shadow(0 0 5px var(--tm-accent-glow))" : "none",
                  transition: "all var(--tm-dur) var(--tm-ease)",
                }}>
                  {item.icon}
                </span>
                {/* Progress nudge dot — pulsing, visible when not on /diary */}
                {item.nudge && !active && (
                  <span
                    className="animate-pulse"
                    style={{
                      position: "absolute", top: -3, right: -3,
                      width: 7, height: 7, borderRadius: "50%",
                      background: "var(--tm-accent)",
                      boxShadow: "0 0 6px var(--tm-accent-glow)",
                    }}
                  />
                )}
              </span>

              <div style={{ opacity: expanded ? 1 : 0, transition: `opacity var(--tm-dur)`, overflow: "hidden", whiteSpace: "nowrap" }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: active ? "var(--tm-accent)" : "var(--tm-text)" }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 11, marginTop: 1 }}>
                  {item.nudge && !active ? (
                    <span style={{ color: "var(--tm-accent)" }}>Log today →</span>
                  ) : (
                    <span style={{ color: "var(--tm-text-faint)" }}>{item.desc}</span>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Accent toggle */}
      {expanded && (
        <div style={{
          padding: "10px 12px 12px",
          borderTop: "1px solid var(--tm-border-soft)",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div className="tm-label-caps" style={{ fontSize: 10 }}>Accent</div>
          <AccentToggle />
        </div>
      )}

      <UserFooter expanded={expanded} fullName={fullName} />
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

  const { data: profileData } = useQuery({
    queryKey: ["profile", token],
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })

  if (!ready) return null

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", position: "relative" }}>
      <ParticleBg />
      <Sidebar score={scoreData?.total_score ?? null} fullName={profileData?.full_name ?? null} onLogoClick={() => setShowAbout(true)} />
      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", zIndex: 2 }}>
        <div className="tm-page-enter" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {children}
        </div>
      </main>
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  )
}
