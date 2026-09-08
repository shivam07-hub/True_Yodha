"use client"

import { useEffect, useState, type CSSProperties } from "react"
import Link from "next/link"

import { setSessionTokens } from "@/lib/session"
import {
  PHONE_LAB_HEIGHT,
  PHONE_LAB_TABS,
  PHONE_LAB_WIDTH,
  type PhoneLabMode,
  type PhoneLabSurface,
  type PhoneLabTabId,
  phoneLabTab,
} from "@/lib/dev/phone-lab"

function href(tab: PhoneLabTabId, mode: PhoneLabMode, surface: PhoneLabSurface) {
  return `/dev/phone?tab=${tab}&mode=${mode}&surface=${surface}`
}

function pill(on: boolean): CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid var(--tm-border-soft)",
    background: on ? "var(--tm-surface-2)" : "transparent",
    color: "var(--tm-text)",
    textDecoration: "none",
  }
}

export function PhoneLab({
  tab,
  mode,
  surface,
}: {
  tab: PhoneLabTabId
  mode: PhoneLabMode
  surface: PhoneLabSurface
}) {
  const [sessionKey, setSessionKey] = useState(0)
  const [sessionState, setSessionState] = useState<"idle" | "busy" | "unset" | "rejected" | "ok">(
    "idle",
  )

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute("data-surface", surface)
    root.style.colorScheme = surface
    try {
      localStorage.setItem("myro-surface", surface)
    } catch {
      // Private mode — the iframe still gets ?surface= in Load.
    }
  }, [surface])

  const src =
    mode === "live"
      ? phoneLabTab(tab).path
      : `/dev/phone/frame?tab=${tab}&surface=${surface}`

  async function takeQaSession() {
    setSessionState("busy")
    const res = await fetch("/dev/qa-session", { method: "POST" })
    if (res.status === 503) {
      setSessionState("unset")
      return
    }
    if (!res.ok) {
      setSessionState("rejected")
      return
    }
    const data = (await res.json()) as {
      access_token?: string
      refresh_token?: string | null
    }
    if (!data.access_token) {
      setSessionState("rejected")
      return
    }
    setSessionTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    })
    setSessionKey((n) => n + 1)
    setSessionState("ok")
  }

  return (
    <div
      className="tm-page-canvas"
      style={{
        minHeight: "100dvh",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        color: "var(--tm-text)",
      }}
    >
      <header style={{ width: PHONE_LAB_WIDTH, display: "grid", gap: 10 }}>
        <h1 className="tm-title" style={{ margin: 0 }}>
          Phone
        </h1>
        <p className="tm-meta" style={{ margin: 0 }}>
          {PHONE_LAB_WIDTH} × {PHONE_LAB_HEIGHT} — same viewport as qa:mobile.
        </p>
        <nav aria-label="Tab" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PHONE_LAB_TABS.map((t) => (
            <Link
              key={t.id}
              href={href(t.id, mode, surface)}
              aria-current={t.id === tab ? "page" : undefined}
              style={pill(t.id === tab)}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <Link href={href(tab, "load", surface)} aria-current={mode === "load" ? "page" : undefined} style={pill(mode === "load")}>
            Load
          </Link>
          <Link href={href(tab, "live", surface)} aria-current={mode === "live" ? "page" : undefined} style={pill(mode === "live")}>
            Live
          </Link>
          <Link href={href(tab, mode, "dark")} aria-current={surface === "dark" ? "page" : undefined} style={pill(surface === "dark")}>
            Dark
          </Link>
          <Link href={href(tab, mode, "light")} aria-current={surface === "light" ? "page" : undefined} style={pill(surface === "light")}>
            Light
          </Link>
          <button
            type="button"
            onClick={() => void takeQaSession()}
            disabled={sessionState === "busy"}
            style={{ ...pill(sessionState === "ok"), cursor: "pointer" }}
          >
            QA session
          </button>
          {sessionState === "unset" ? (
            <span className="tm-meta">QA credentials missing</span>
          ) : null}
          {sessionState === "rejected" ? (
            <span className="tm-meta">QA login failed</span>
          ) : null}
        </div>
      </header>
      <iframe
        key={`${mode}-${tab}-${surface}-${sessionKey}`}
        title="Handset"
        src={src}
        width={PHONE_LAB_WIDTH}
        height={PHONE_LAB_HEIGHT}
        style={{
          width: PHONE_LAB_WIDTH,
          height: PHONE_LAB_HEIGHT,
          border: "1px solid var(--tm-border-soft)",
          background: "var(--tm-bg)",
          display: "block",
        }}
      />
    </div>
  )
}
