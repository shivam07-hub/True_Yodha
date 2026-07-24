"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { useFollowCompany } from "@/lib/hooks/use-follow-company"
import { formatCount } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ThemeControl } from "@/components/ui/theme-control"
import { AccentControl } from "@/components/ui/accent-control"
import { TargetRolesChips } from "@/components/target-role/target-roles-chips"
import { CompanyLink } from "@/components/companies/company-link"
import { billing, jobs, users } from "@/lib/api"
import type { ProfileUpdate, UserProfile } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { MYRO_COINS_POLICY } from "@/lib/xp-policy"
import { useXPStore } from "@/store/xpStore"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { MyrologyOptInPrompt, useMyrologyInterest } from "@/components/myrology-optin-prompt"
import { LinkedInIcon } from "@/components/icons/social-icons"
import Link from "next/link"
import {
  CATEGORIES,
  CATEGORY_ORDER,
  CategoryGlyph,
  openFeedbackHub,
  type FeedbackCategory,
} from "@/components/feedback"
import "./settings-modal.css"

export type Tab = "Account" | "Following" | "Feedback" | "Billing"
type SidebarProfile = Pick<UserProfile, "full_name" | "email" | "target_role_title" | "target_role_titles" | "target_roles" | "target_location" | "target_locations" | "linkedin_url">
type SaveStatus = "idle" | "saving" | "saved" | "error"
type BillingStatus = "idle" | "creating" | "verifying" | "success" | "error"

type RazorpaySuccessResponse = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

type RazorpayFailureResponse = {
  error?: {
    code?: string
    description?: string
    reason?: string
  }
}

type RazorpayCheckoutOptions = {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  prefill?: { name?: string; email?: string }
  theme?: { color?: string; backdrop_color?: string }
  modal?: {
    confirm_close?: boolean
    ondismiss?: () => void
  }
  handler: (response: RazorpaySuccessResponse) => void
}

type RazorpayCheckout = {
  open: () => void
  on: (event: "payment.failed", handler: (response: RazorpayFailureResponse) => void) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckout
  }
}

const AUTOSAVE_MS = 800
const SAVED_DISPLAY_MS = 2000
const XP_PACK_AMOUNT = 1000
const XP_PACK_PRICE_RUPEES = 99

const normalize = (v: string): string | null => v.trim() || null
const messageFromError = (error: unknown, fallback: string): string => (
  error instanceof Error && error.message ? error.message : fallback
)
const normalizeLinkedIn = (v: string): string | null => {
  const t = v.trim()
  if (!t) return null
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}
const MAX_TARGET_LOCATIONS = 5
const normalizeLocations = (locations: string[]): string[] => {
  const seen = new Set<string>()
  return locations.reduce<string[]>((acc, loc) => {
    const t = loc.trim()
    if (!t || seen.has(t.toLowerCase()) || acc.length >= MAX_TARGET_LOCATIONS) return acc
    seen.add(t.toLowerCase())
    return [...acc, t]
  }, [])
}

// Inline, state-aware save indicator. Sits next to the thing being saved
// (section header / chips) rather than in a disconnected corner. Renders nothing
// while idle so it never lingers as a permanent label.
function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === "idle") return null
  const map = {
    saving: { text: "Saving…", color: "var(--tm-text-faint)", weight: 400 },
    saved: { text: "✓ Saved", color: "var(--tm-success)", weight: 500 },
    error: { text: "Couldn't save", color: "var(--tm-danger)", weight: 500 },
  } as const
  const s = map[status]
  return <span role="status" style={{ fontSize: 11, color: s.color, fontWeight: s.weight, whiteSpace: "nowrap" }}>{s.text}</span>
}

function InitialsAvatar({ name, size = 52 }: { name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("") || "?"
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "var(--tm-interactive)", color: "var(--tm-interactive-fg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.38), fontWeight: 700, letterSpacing: "-0.02em",
      boxShadow: "0 0 16px var(--tm-int-bg-hover)",
    }}>
      {initials}
    </div>
  )
}

function CompanyAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.trim().split(/[\s\-&]+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("") || "?"
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, flexShrink: 0,
      background: "rgba(255,255,255,0.05)", border: "1px solid var(--tm-border-soft)",
      color: "var(--tm-text-muted)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.38), fontWeight: 600,
    }}>
      {initials}
    </div>
  )
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: "var(--tm-radius-sm)",
  background: "rgba(255,255,255,0.03)", border: "1px solid var(--tm-border-soft)",
  color: "var(--tm-text)", fontSize: 13, fontFamily: "inherit", outline: "none",
  transition: "border-color var(--tm-dur) var(--tm-ease), box-shadow var(--tm-dur) var(--tm-ease)",
  boxSizing: "border-box" as const,
}
const INPUT_FOCUS_STYLE = { borderColor: "var(--tm-int-border)", boxShadow: "0 0 0 2px var(--tm-int-bg-hover)" }
const INPUT_BLUR_STYLE = { borderColor: "var(--tm-border-soft)", boxShadow: "none" }

const SECTION_HEADER: React.CSSProperties = {
  fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase" as const,
  color: "var(--tm-text-faint)", marginBottom: 4, marginTop: 24,
}
const ROW_STYLE: React.CSSProperties = {
  padding: "14px 0", borderBottom: "1px solid var(--tm-border-soft)",
  display: "flex", flexDirection: "column", gap: 8,
}
const ROW_LABEL: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: "var(--tm-text)",
}
const ROW_DESC: React.CSSProperties = {
  fontSize: 12, color: "var(--tm-text-faint)", marginTop: 1,
}

export function SettingsModal({ open, onClose, profile, initialTab = "Account" }: {
  open: boolean; onClose: () => void; profile: SidebarProfile | null; initialTab?: Tab
}) {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const applyXpChange = useXPStore((s) => s.applyXpChange)
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const { interested: myrologyInterested, setInterested: setMyrologyInterested } = useMyrologyInterest()
  const [myroPromptOpen, setMyroPromptOpen] = useState(false)

  // Account tab state
  const [name, setName] = useState("")
  const [locations, setLocations] = useState<string[]>([])
  const [locationInput, setLocationInput] = useState("")
  const [linkedin, setLinkedin] = useState("")
  const [locationDropdown, setLocationDropdown] = useState(false)
  const [locationFocused, setLocationFocused] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [rewardNotice, setRewardNotice] = useState<string | null>(null)
  const [billingStatus, setBillingStatus] = useState<BillingStatus>("idle")
  const [billingMessage, setBillingMessage] = useState<string | null>(null)

  // Following tab state
  const [companyInput, setCompanyInput] = useState("")
  const [companySearchTerm, setCompanySearchTerm] = useState("")
  const [companyDropdown, setCompanyDropdown] = useState(false)
  const [companyFocused, setCompanyFocused] = useState(false)

  const locationInputRef = useRef<HTMLInputElement>(null)
  const locationCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const companyInputRef = useRef<HTMLInputElement>(null)
  const companyCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<ProfileUpdate>({})

  useEffect(() => {
    if (!open) return
    setName(profile?.full_name ?? "")
    setLocations(
      profile?.target_locations?.filter((l) => l.trim())
      ?? (profile?.target_location ? [profile.target_location] : [])
    )
    setLinkedin(profile?.linkedin_url ?? "")
    setLocationInput(""); setLocationDropdown(false); setLocationFocused(false)
    setSaveStatus("idle"); setSaveError(null); setRewardNotice(null)
    setBillingStatus("idle"); setBillingMessage(null); pending.current = {}
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }, [open, profile?.full_name, profile?.target_location, profile?.target_locations, profile?.linkedin_url])

  useEffect(() => () => {
    if (locationCloseTimer.current) clearTimeout(locationCloseTimer.current)
  }, [])

  // Profile save mutation
  const mutation = useMutation({
    mutationFn: (payload: ProfileUpdate) => {
      if (!token) throw new Error("Session not ready — please refresh.")
      return users.updateProfile(token, payload)
    },
    onSuccess: (data) => {
      if (typeof data.new_coin_balance === "number") applyXpChange({ newBalance: data.new_coin_balance, action: "profile_update" })
      if ((data.coins_earned ?? 0) > 0) setRewardNotice(`+${data.coins_earned} Myro Coins earned`)
      queryClient.invalidateQueries({ queryKey: dataKeys.profile() })
      setSaveStatus("saved"); setSaveError(null)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSaveStatus("idle"), SAVED_DISPLAY_MS)
    },
    onError: (err) => {
      setSaveStatus("error")
      setSaveError(err instanceof Error ? err.message : "Could not save")
    },
  })

  // Following — optimistic follow/unfollow + IH2 gating owned by the hook.
  const following = useFollowCompany(token, { enabled: open && activeTab === "Following" })

  useEffect(() => {
    const term = companyInput.trim()
    const timer = setTimeout(() => setCompanySearchTerm(term), 250)
    return () => clearTimeout(timer)
  }, [companyInput])

  const { data: companySuggestions = [] } = useQuery({
    queryKey: ["companySuggestions", companySearchTerm],
    queryFn: () => jobs.searchCompanies(companySearchTerm),
    enabled: open && activeTab === "Following" && companySearchTerm.length >= 2,
    staleTime: 60 * 1000,
  })

  const filteredSuggestions = companySuggestions.filter(
    (name) => !following.followedNames.some((n) => n.toLowerCase() === name.toLowerCase())
  )

  function selectCompany(name: string) {
    if (companyCloseTimer.current) clearTimeout(companyCloseTimer.current)
    // Optimistic: the chip appears instantly inside the hook, so clear the
    // input and close the dropdown now rather than waiting on the round-trip.
    following.follow(name)
    setCompanyInput("")
    setCompanyDropdown(false)
  }

  function schedule(updates: ProfileUpdate) {
    pending.current = { ...pending.current, ...updates }
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    setSaveStatus("saving"); setSaveError(null)
    autosaveTimer.current = setTimeout(() => {
      const payload = { ...pending.current }
      pending.current = {}
      mutation.mutate(payload)
    }, AUTOSAVE_MS)
  }

  function flushAndClose() {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current); autosaveTimer.current = null
      const payload = { ...pending.current }; pending.current = {}
      if (Object.keys(payload).length > 0) mutation.mutate(payload)
    }
    onClose()
  }

  const locationCatalogQuery = useQuery({
    queryKey: dataKeys.jobsAnalytics(),
    queryFn: () => jobs.analytics(),
    enabled: open,
    staleTime: 10 * 60 * 1000,
  })
  const locationCatalog = useMemo(() => {
    const cityOptions = (locationCatalogQuery.data?.by_location_city ?? [])
      .map((item) => item.name.trim()).filter((n) => n.length > 0 && n.toLowerCase() !== "unknown")
    const countryOptions = (locationCatalogQuery.data?.by_location_country ?? [])
      .map((item) => item.name.trim()).filter((n) => n.length > 0 && n.toLowerCase() !== "unknown")
    // Mode (Remote/Hybrid/Onsite) is intentionally not a location — geo prefs
    // are city/country only.
    const merged = [...cityOptions, ...countryOptions]
    const seen = new Set<string>()
    return merged.reduce<string[]>((acc, entry) => {
      const normalized = entry.toLowerCase()
      if (seen.has(normalized)) return acc
      seen.add(normalized)
      return [...acc, entry]
    }, [])
  }, [locationCatalogQuery.data])

  const locationsAtMax = locations.length >= MAX_TARGET_LOCATIONS
  const locationSuggestions = useMemo(() => {
    const chosen = new Set(locations.map((l) => l.toLowerCase()))
    const pool = locationCatalog.filter((entry) => !chosen.has(entry.toLowerCase()))
    const needle = locationInput.trim().toLowerCase()
    if (!needle) return pool.slice(0, 10)
    return pool.filter((entry) => entry.toLowerCase().includes(needle)).slice(0, 10)
  }, [locationInput, locationCatalog, locations])

  function handleLocationsChange(next: string[]) {
    const cleaned = normalizeLocations(next)
    setLocations(cleaned)
    schedule({ target_locations: cleaned })
  }
  function selectLocation(loc: string) {
    if (locationsAtMax) return
    if (locations.some((l) => l.toLowerCase() === loc.toLowerCase())) return
    handleLocationsChange([...locations, loc])
    setLocationInput(""); setLocationDropdown(false)
    locationInputRef.current?.focus()
  }
  function removeLocation(i: number) {
    handleLocationsChange(locations.filter((_, idx) => idx !== i))
  }

  async function handleBuyXP() {
    if (!token) {
      setBillingStatus("error")
      setBillingMessage("Session not ready — please refresh.")
      return
    }

    const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    if (!key) {
      setBillingStatus("error")
      setBillingMessage("Razorpay public key is not configured.")
      return
    }

    if (typeof window === "undefined" || !window.Razorpay) {
      setBillingStatus("error")
      setBillingMessage("Razorpay checkout is still loading. Try again in a moment.")
      return
    }

    setBillingStatus("creating")
    setBillingMessage("Opening Razorpay checkout…")

    try {
      const order = await billing.createOrder(token)
      let completed = false
      const checkout = new window.Razorpay({
        key,
        amount: order.amount,
        currency: order.currency,
        name: "Myro",
        description: `${XP_PACK_AMOUNT} Myro Coins launch pack`,
        order_id: order.order_id,
        prefill: {
          name: name || undefined,
          email: profile?.email || undefined,
        },
        theme: {
          color: "var(--tm-interactive)",
          backdrop_color: "#050A18",
        },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            if (completed) return
            setBillingStatus("error")
            setBillingMessage("Checkout closed before payment.")
          },
        },
        handler: async (response) => {
          completed = true
          setBillingStatus("verifying")
          setBillingMessage("Verifying payment…")
          try {
            const verified = await billing.verifyPayment(token, response)
            applyXpChange({ newBalance: verified.new_coin_balance, action: "xp_purchase" })
            setBillingStatus("success")
            setBillingMessage(`+${verified.coins_earned} Myro Coins added. New balance: ${verified.new_coin_balance} Myro Coins.`)
          } catch (error) {
            setBillingStatus("error")
            setBillingMessage(messageFromError(error, "Payment verification failed."))
          }
        },
      })

      checkout.on("payment.failed", (response) => {
        completed = true
        setBillingStatus("error")
        setBillingMessage(response.error?.description || response.error?.reason || "Payment failed. Please retry.")
      })

      checkout.open()
    } catch (error) {
      setBillingStatus("error")
      setBillingMessage(messageFromError(error, "Could not start Razorpay checkout."))
    }
  }

  const followedCompanies = following.companies
  const targetRoleTitles =
    profile?.target_role_titles?.length
      ? profile.target_role_titles
      : profile?.target_role_title
        ? [profile.target_role_title]
        : (profile?.target_roles ?? [])

  // Following-tab save state, derived from the follow hook so the indicator can
  // sit inline next to the chips. Flashes "✓ Saved" briefly once an in-flight
  // follow/unfollow settles cleanly, then falls back to idle.
  const [followSavedFlash, setFollowSavedFlash] = useState(false)
  const prevFollowPending = useRef(false)
  useEffect(() => {
    const wasPending = prevFollowPending.current
    prevFollowPending.current = following.anyPending
    if (wasPending && !following.anyPending && !following.error) {
      setFollowSavedFlash(true)
      const t = setTimeout(() => setFollowSavedFlash(false), SAVED_DISPLAY_MS)
      return () => clearTimeout(t)
    }
  }, [following.anyPending, following.error])

  const followStatus: SaveStatus = following.anyPending
    ? "saving"
    : following.error
    ? "error"
    : followSavedFlash
    ? "saved"
    : "idle"

  const statusNode = saveStatus === "idle" ? null : <SaveBadge status={saveStatus} />

  const liveAnnouncement = saveStatus === "saved"
    ? "Profile saved"
    : saveStatus === "error"
    ? `Save failed: ${saveError ?? "unknown error"}`
    : followStatus === "saved"
    ? "Target companies updated"
    : followStatus === "error"
    ? `Could not update target companies: ${following.error?.message ?? "unknown error"}`
    : ""

  const TAB_ICONS: Record<Tab, string> = { Account: "◉", Following: "★", Feedback: "◎", Billing: "▤" }

  return (
    <>
    <MyrologyOptInPrompt open={myroPromptOpen} onClose={() => setMyroPromptOpen(false)} />
    <Dialog open={open} onOpenChange={(next) => { if (!next) flushAndClose() }}>
      <DialogContent
        showCloseButton={false}
        className="tm-settings-dialog sm:max-w-[740px] max-w-[calc(100%-1.5rem)] p-0 bg-transparent ring-0"
        style={{
          background: "var(--tm-surface)", border: "1px solid var(--tm-int-border)",
          borderRadius: "var(--tm-radius-xl)", boxShadow: "0 0 60px rgba(0,0,0,0.65)",
          height: "88dvh", maxHeight: 820,
          display: "flex", overflow: "hidden",
        }}
      >
        <div aria-live="polite" aria-atomic="true" className="sr-only">{liveAnnouncement}</div>

        {/* ── Left sidebar ── */}
        <div className="tm-settings-sidebar" style={{
          width: 200, flexShrink: 0,
          borderRight: "1px solid var(--tm-border-soft)",
          display: "flex", flexDirection: "column",
          background: "rgba(255,255,255,0.015)",
        }}>
          {/* Profile card */}
          <div className="tm-settings-profile" style={{ padding: "28px 20px 20px", borderBottom: "1px solid var(--tm-border-soft)" }}>
            <InitialsAvatar name={name || "?"} size={52} />
            <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: "var(--tm-text)", lineHeight: 1.3 }}>
              {name || "Set your name"}
            </div>
            <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 4, wordBreak: "break-all" }}>
              {profile?.email ?? ""}
            </div>
          </div>

          {/* Nav tabs */}
          <nav className="tm-settings-nav" style={{ padding: "12px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            {(["Account", "Following", "Feedback", "Billing"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="tm-settings-nav-tab"
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "10px 12px", borderRadius: "var(--tm-radius-sm)", cursor: "pointer",
                  background: activeTab === tab ? "var(--tm-int-bg-wash)" : "transparent",
                  border: `1px solid ${activeTab === tab ? "var(--tm-int-border)" : "transparent"}`,
                  color: activeTab === tab ? "var(--tm-interactive)" : "var(--tm-interactive-rest)",
                  fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
                  fontFamily: "inherit", textAlign: "left",
                  transition: "all 180ms var(--tm-ease)",
                }}
              >
                <span className="tm-settings-nav-icon" style={{ fontSize: 12, opacity: 0.8 }}>{TAB_ICONS[tab]}</span>
                <span>{tab}</span>
                {tab === "Following" && following.count > 0 && (
                  <Badge variant="default" className="tm-settings-nav-badge" style={{ marginLeft: "auto" }}>
                    {following.count}
                  </Badge>
                )}
                {tab === "Feedback" && (
                  <Badge variant="success" className="tm-settings-nav-badge" style={{ marginLeft: "auto" }}>
                    NEW
                  </Badge>
                )}
              </button>
            ))}
          </nav>

          {/* Autosave indicator — transient only; lives inline next to each
              section's content (see SaveBadge), so the corner no longer carries
              a permanent "Auto-saved" label. */}
          {statusNode && (
            <div className="tm-settings-autosave" style={{ padding: "14px 20px", borderTop: "1px solid var(--tm-border-soft)", minHeight: 44, display: "flex", alignItems: "center" }}>
              {statusNode}
            </div>
          )}
        </div>

        {/* ── Right content ── */}
        <div className="tm-settings-panel" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {/* Tab header */}
          <div className="tm-settings-header" style={{
            padding: "20px 28px 16px", borderBottom: "1px solid var(--tm-border-soft)",
            display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--tm-text)", margin: 0 }}>
              {activeTab}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* One Save for the whole modal: flushes any pending edit and closes,
                so the tap itself is the acknowledgement (no waiting on a round-trip). */}
            <Button
              type="button" variant="solid" size="sm" onClick={flushAndClose}
              style={{ touchAction: "manipulation" }}
            >
              Save
            </Button>
            <button
              type="button" aria-label="Close settings" onClick={flushAndClose}
              style={{
                background: "transparent", border: "1px solid transparent",
                color: "var(--tm-interactive-rest)", fontSize: 20, cursor: "pointer",
                lineHeight: 1, padding: "4px 6px", borderRadius: "var(--tm-radius-sm)",
                transition: "color var(--tm-dur), background var(--tm-dur), border-color var(--tm-dur)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent" }}
            >×</button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="tm-settings-body" style={{ flex: 1, overflowY: "auto", padding: "8px 28px 28px" }}>

            {/* ── ACCOUNT TAB ── */}
            {activeTab === "Account" && (
              <>
                {/* Profile section */}
                <div style={SECTION_HEADER}>Profile</div>

                <div style={ROW_STYLE}>
                  <div style={ROW_LABEL}>Email</div>
                  <input
                    id="sm-email" type="email" value={profile?.email ?? ""} readOnly disabled
                    aria-readonly="true"
                    style={{ ...INPUT_STYLE, opacity: 0.55, cursor: "not-allowed" }}
                  />
                </div>

                <div style={ROW_STYLE}>
                  <div style={ROW_LABEL}>Public Name</div>
                  <input
                    id="sm-ninja-name" type="text" value={name}
                    onChange={(e) => { setName(e.target.value); schedule({ full_name: normalize(e.target.value) }) }}
                    placeholder="Your display name"
                    style={INPUT_STYLE}
                    onFocus={(e) => Object.assign(e.currentTarget.style, INPUT_FOCUS_STYLE)}
                    onBlur={(e) => Object.assign(e.currentTarget.style, INPUT_BLUR_STYLE)}
                  />
                </div>

                <div className="tm-settings-linkedin-row" style={{ ...ROW_STYLE, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={ROW_LABEL}>LinkedIn</div>
                    <div style={ROW_DESC}>Add once to earn +{MYRO_COINS_POLICY.linkedInProfile} Myro Coins</div>
                  </div>
                  <div className="tm-settings-linkedin-field" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, maxWidth: "55%" }}>
                    <LinkedInIcon size={14} aria-hidden style={{ color: "var(--tm-text-faint)", flexShrink: 0 }} />
                    <input
                      id="sm-linkedin" type="url" value={linkedin}
                      onChange={(e) => { setLinkedin(e.target.value); schedule({ linkedin_url: normalizeLinkedIn(e.target.value) }) }}
                      placeholder="linkedin.com/in/you"
                      style={{ ...INPUT_STYLE, fontSize: 12 }}
                      onFocus={(e) => Object.assign(e.currentTarget.style, INPUT_FOCUS_STYLE)}
                      onBlur={(e) => Object.assign(e.currentTarget.style, INPUT_BLUR_STYLE)}
                    />
                  </div>
                </div>

                {/* Myrology — free interest opt-in (separate from the paid unlock). */}
                <div style={SECTION_HEADER}>Cosmic</div>
                <div style={{ ...ROW_STYLE, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ paddingRight: 16 }}>
                    <div style={ROW_LABEL}>✦ Myrology</div>
                    <div style={ROW_DESC}>A second signal from your birth chart — shown in your navigation.</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={myrologyInterested}
                    aria-label="Myrology in navigation"
                    onClick={() => {
                      if (myrologyInterested) setMyrologyInterested(false)
                      else setMyroPromptOpen(true)
                    }}
                    style={{
                      flexShrink: 0, width: 44, height: 26, borderRadius: 99, padding: 3, cursor: "pointer",
                      border: "1px solid var(--tm-int-border)",
                      background: myrologyInterested ? "var(--tm-interactive)" : "rgba(255,255,255,0.05)",
                      display: "flex", justifyContent: myrologyInterested ? "flex-end" : "flex-start",
                      transition: "background var(--tm-dur) var(--tm-ease)",
                    }}
                  >
                    <span style={{
                      width: 18, height: 18, borderRadius: "50%",
                      background: myrologyInterested ? "var(--tm-interactive-fg)" : "var(--tm-text-faint)",
                    }} />
                  </button>
                </div>

                {/* Appearance — applies instantly, independent of Save. */}
                <div style={SECTION_HEADER}>Appearance</div>
                <div style={{ ...ROW_STYLE, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={ROW_LABEL}>Theme</div>
                  <ThemeControl />
                </div>
                <div style={{ ...ROW_STYLE, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={ROW_LABEL}>Accent</div>
                  <AccentControl onPersist={(next) => mutation.mutate({ accent_pref: next })} />
                </div>

                {/* Save lives in the header — this row carries only what the
                    header can't show: an earned reward, or a failed save. */}
                {(rewardNotice || (saveStatus === "error" && saveError)) && (
                  <div style={{ paddingTop: 20, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
                    {rewardNotice && (
                      <span style={{ fontSize: 12, color: "var(--tm-success)", fontWeight: 600 }}>{rewardNotice}</span>
                    )}
                    {saveStatus === "error" && saveError && (
                      <span style={{ fontSize: 12, color: "var(--tm-danger)" }}>{saveError}</span>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── FOLLOWING TAB ── */}
            {activeTab === "Following" && (
              <>
                {/* Job search section */}
                <div style={SECTION_HEADER}>Job Search</div>

                {/* Target role — the single role the Myro Score + matches are
                    measured against. Edits route through the canonical,
                    recompute-wired path (#145); job-match clusters are derived
                    server-side, so there is no separate role array to manage. */}
                <div style={ROW_STYLE}>
                  <div style={ROW_LABEL}>Target Roles</div>
                  <div style={{ marginTop: 10 }}>
                    <TargetRolesChips roles={targetRoleTitles} editable showReadiness />
                  </div>
                </div>

                {/* Target location */}
                <div style={ROW_STYLE}>
                  <div style={ROW_LABEL}>Target Locations</div>
                  <div style={{ position: "relative" }}>
                    <input
                      ref={locationInputRef} id="sm-location" type="text" value={locationInput}
                      role="combobox" aria-expanded={locationDropdown && locationSuggestions.length > 0}
                      aria-controls="sm-location-listbox" aria-autocomplete="list" aria-label="Search target locations"
                      onChange={(e) => { setLocationInput(e.target.value); setLocationDropdown(true) }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (locationSuggestions[0]) selectLocation(locationSuggestions[0]) } if (e.key === "Escape") setLocationDropdown(false) }}
                      placeholder={locationsAtMax ? `Max ${MAX_TARGET_LOCATIONS} selected` : "Add a city or country…"}
                      disabled={locationsAtMax} autoComplete="off"
                      style={{ ...INPUT_STYLE, borderColor: locationFocused ? "var(--tm-int-border)" : "var(--tm-border-soft)", opacity: locationsAtMax ? 0.45 : 1 }}
                      onFocus={(e) => { setLocationFocused(true); setLocationDropdown(true); Object.assign(e.currentTarget.style, INPUT_FOCUS_STYLE) }}
                      onBlur={(e) => { locationCloseTimer.current = setTimeout(() => setLocationDropdown(false), 150); setLocationFocused(false); Object.assign(e.currentTarget.style, INPUT_BLUR_STYLE) }}
                    />
                    {locationDropdown && locationSuggestions.length > 0 && (
                      <div
                        id="sm-location-listbox" role="listbox" aria-label="Location suggestions"
                        onMouseDown={() => { if (locationCloseTimer.current) clearTimeout(locationCloseTimer.current) }}
                        style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--tm-surface)", border: "1px solid var(--tm-int-border)", borderRadius: "var(--tm-radius-sm)", zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", maxHeight: 220, overflowY: "auto" }}
                      >
                        {locationSuggestions.map((entry) => (
                          <button key={entry} type="button" role="option" aria-selected={false} onClick={() => selectLocation(entry)}
                            style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", background: "transparent", border: "none", borderBottom: "1px solid var(--tm-border-soft)", color: "var(--tm-interactive-rest)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-int-bg-wash)"; e.currentTarget.style.color = "var(--tm-interactive)" }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--tm-interactive-rest)" }}
                          >{entry}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {locations.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {locations.map((loc, i) => (
                        <div key={loc} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 12px", borderRadius: "var(--tm-radius-pill)", background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)", fontSize: 12, color: "var(--tm-interactive)" }}>
                          <span style={{ fontWeight: 500 }}>{loc}</span>
                          <button
                            type="button" onClick={() => removeLocation(i)} aria-label={`Remove ${loc}`}
                            style={{ width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--tm-int-border-soft)", border: "none", padding: 0, cursor: "pointer", color: "var(--tm-interactive)", fontSize: 12, lineHeight: 1 }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Company search combobox — same pattern as Target Roles */}
                <div style={{ ...ROW_STYLE, marginTop: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={ROW_LABEL}>Target Companies</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <SaveBadge status={followStatus} />
                      {followedCompanies.length > 0 && (
                        <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
                          {followedCompanies.length} targeted
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      ref={companyInputRef}
                      type="text"
                      value={companyInput}
                      role="combobox"
                      aria-expanded={companyDropdown && filteredSuggestions.length > 0}
                      aria-controls="sm-company-listbox"
                      aria-autocomplete="list"
                      aria-label="Search companies to follow"
                      onChange={(e) => { setCompanyInput(e.target.value); setCompanyDropdown(true) }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); if (filteredSuggestions[0]) selectCompany(filteredSuggestions[0]) }
                        if (e.key === "Escape") setCompanyDropdown(false)
                      }}
                      onFocus={(e) => { setCompanyFocused(true); setCompanyDropdown(true); Object.assign(e.currentTarget.style, INPUT_FOCUS_STYLE) }}
                      onBlur={(e) => { companyCloseTimer.current = setTimeout(() => setCompanyDropdown(false), 150); setCompanyFocused(false); Object.assign(e.currentTarget.style, INPUT_BLUR_STYLE) }}
                      placeholder="Search companies…"
                      autoComplete="off"
                      style={{ ...INPUT_STYLE, borderColor: companyFocused ? "var(--tm-int-border)" : "var(--tm-border-soft)" }}
                    />
                    {companyDropdown && filteredSuggestions.length > 0 && (
                      <div
                        id="sm-company-listbox"
                        role="listbox"
                        aria-label="Company suggestions"
                        onMouseDown={() => { if (companyCloseTimer.current) clearTimeout(companyCloseTimer.current) }}
                        style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--tm-surface)", border: "1px solid var(--tm-int-border)", borderRadius: "var(--tm-radius-sm)", zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", maxHeight: 220, overflowY: "auto" }}
                      >
                        {filteredSuggestions.map((name) => (
                          <button
                            key={name}
                            type="button"
                            role="option"
                            aria-selected={false}
                            onClick={() => selectCompany(name)}
                            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", background: "transparent", border: "none", borderBottom: "1px solid var(--tm-border-soft)", color: "var(--tm-interactive-rest)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-int-bg-wash)"; e.currentTarget.style.color = "var(--tm-interactive)" }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--tm-interactive-rest)" }}
                          >
                            <CompanyAvatar name={name} />
                            <span style={{ flex: 1 }}>{name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {following.error && (
                    <div role="alert" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--tm-danger, #f87171)" }}>
                      <span>{following.error.message}</span>
                      <button
                        type="button"
                        onClick={() => { if (following.error) following.toggle(following.error.name) }}
                        style={{ background: "transparent", border: "1px solid currentColor", color: "inherit", borderRadius: "var(--tm-radius-sm)", padding: "2px 8px", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>

                {/* Followed companies list */}
                {following.isLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                    {[1, 2, 3].map((i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--tm-border-soft)" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.05)", flexShrink: 0 }} />
                        <div style={{ flex: 1, height: 14, borderRadius: 4, background: "rgba(255,255,255,0.05)" }} />
                      </div>
                    ))}
                  </div>
                ) : followedCompanies.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "32px 0", textAlign: "center" }}>
                    <div style={{ fontSize: 28, opacity: 0.2, color: "var(--tm-interactive)" }}>★</div>
                    <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>
                      Follow a company to track its hiring
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {followedCompanies.map((company) => (
                      <div key={company.company_name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 12px", borderRadius: "var(--tm-radius-pill)", background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)", fontSize: 12, color: "var(--tm-interactive)" }}>
                        <CompanyLink company={company.company_name} stopPropagation={false} />

                        <button
                          type="button"
                          onClick={() => following.unfollow(company.company_name)}
                          disabled={following.isPending(company.company_name)}
                          aria-label={`Unfollow ${company.company_name}`}
                          style={{ width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--tm-int-border-soft)", border: "none", padding: 0, cursor: "pointer", color: "var(--tm-interactive)", fontSize: 12, lineHeight: 1 }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── BILLING TAB ── */}
            {activeTab === "Billing" && (
              <BillingTabContent
                status={billingStatus}
                message={billingMessage}
                onBuy={handleBuyXP}
                onClose={flushAndClose}
              />
            )}

            {/* ── FEEDBACK TAB ── */}
            {activeTab === "Feedback" && (
              <FeedbackTabContent onClose={flushAndClose} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}

// ── Billing tab content ────────────────────────────────────────────────────

function BillingTabContent({
  status,
  message,
  onBuy,
  onClose,
}: {
  status: BillingStatus
  message: string | null
  onBuy: () => void
  onClose: () => void
}) {
  const busy = status === "creating" || status === "verifying"
  // Truth comes from the key Razorpay itself issues: rzp_test_* vs rzp_live_*.
  // The badge is derived, never hardcoded, so it can never claim "live" while a
  // test key is configured (or vice-versa).
  const isTestMode = (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "").startsWith("rzp_test_")
  const buttonLabel = status === "creating"
    ? "Opening checkout..."
    : status === "verifying"
    ? "Verifying..."
    : `Pay Rs ${XP_PACK_PRICE_RUPEES}`
  const messageColor = status === "success"
    ? "var(--tm-success)"
    : status === "error"
    ? "var(--tm-danger)"
    : "var(--tm-text-faint)"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 4 }}>
      <div style={SECTION_HEADER}>Myro Coin packs</div>

      <Link
        href="/tokens"
        onClick={onClose}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 14px",
          borderRadius: "var(--tm-radius-sm)",
          border: "1px solid var(--tm-int-border)",
          background: "var(--tm-int-bg-wash)",
          color: "var(--tm-interactive)",
          fontSize: 12,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        <span>New to Myro Coins? See how they work first.</span>
        <span aria-hidden>→</span>
      </Link>

      <div style={{
        padding: 18,
        borderRadius: "var(--tm-radius)",
        background: "linear-gradient(180deg, var(--tm-int-bg-wash), rgba(255,255,255,0.015))",
        border: "1px solid var(--tm-int-border)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start" }}>
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center",
              padding: "3px 8px", borderRadius: "var(--tm-radius-pill)",
              border: "1px solid var(--tm-int-border)", color: "var(--tm-interactive)",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              Launch price
            </div>
            <div style={{ marginTop: 12, fontSize: 24, fontWeight: 750, color: "var(--tm-text)", lineHeight: 1 }}>
              {formatCount(XP_PACK_AMOUNT)} Myro Coins
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.5, maxWidth: 360 }}>
              Use Myro Coins for company follows, match refreshes, and focused practice sessions.
            </div>
          </div>

          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--tm-text)", lineHeight: 1 }}>
              Rs {XP_PACK_PRICE_RUPEES}
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--tm-text-faint)" }}>
              Razorpay Standard Checkout
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onBuy}
            disabled={busy}
            style={{
              padding: "10px 20px", borderRadius: "var(--tm-radius-sm)", border: "none",
              background: status === "success" ? "var(--tm-success)" : "var(--tm-interactive)",
              color: "var(--tm-interactive-fg)", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.72 : 1,
              minWidth: 150, boxShadow: busy ? "none" : "0 0 18px var(--tm-int-bg-hover)",
              transition: "opacity var(--tm-dur) var(--tm-ease), background var(--tm-dur) var(--tm-ease)",
            }}
          >
            {buttonLabel}
          </button>

          {message && (
            <div role="status" style={{ fontSize: 12, color: messageColor, lineHeight: 1.45, maxWidth: 360 }}>
              {message}
            </div>
          )}
        </div>

        <p style={{ marginTop: 14, fontSize: 11, color: "var(--tm-text-faint)", lineHeight: 1.55, maxWidth: 420 }}>
          By paying, you agree to Myro&rsquo;s{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "var(--tm-interactive)", textDecoration: "none" }}>Terms</a>
          {" "}and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--tm-interactive)", textDecoration: "none" }}>Privacy Policy</a>.
          Myro Coins are in-platform credits that fund Myro&rsquo;s operation — they are not payment for any job or hiring outcome.
        </p>
      </div>

      <div style={{
        padding: "12px 16px",
        borderRadius: "var(--tm-radius-sm)",
        border: "1px solid var(--tm-border-soft)",
        background: "rgba(255,255,255,0.015)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      }}>
        <div>
          <div style={{
            fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
            color: "var(--tm-text-faint)", fontWeight: 500,
          }}>
            Payment partner
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: "var(--tm-text)" }}>
            Razorpay
          </div>
        </div>
        <span style={{ fontSize: 11, color: isTestMode ? "var(--tm-warning)" : "var(--tm-text-faint)" }}>
          {isTestMode ? "Test mode" : "Secure checkout"}
        </span>
      </div>
    </div>
  )
}

// ── Feedback tab content ───────────────────────────────────────────────────

function FeedbackTabContent({ onClose }: { onClose: () => void }) {
  function open(category?: FeedbackCategory) {
    onClose()
    // Defer so the close animation finishes before the hub modal opens.
    requestAnimationFrame(() => openFeedbackHub(category ? { category } : {}))
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 4 }}>
      {/* Hero */}
      <div style={{
        padding: 18,
        borderRadius: "var(--tm-radius)",
        background: "linear-gradient(180deg, var(--tm-int-bg-wash), transparent)",
        border: "1px solid var(--tm-int-border)",
      }}>
        <div style={{
          fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
          color: "var(--tm-interactive)", fontWeight: 500,
        }}>Direct line</div>
        <div style={{ marginTop: 6, fontSize: 18, color: "var(--tm-text)", fontWeight: 600 }}>
          Help shape Myro
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.55 }}>
          Every dispatch is read by a human. A growing share of Myro&apos;s roadmap starts as a user signal.
        </div>
        <Button type="button" variant="solid" size="sm" onClick={() => open()} style={{ marginTop: 14 }}>
          Open feedback hub <span>↗</span>
        </Button>
      </div>

      {/* Quick dispatch */}
      <div>
        <div style={{
          fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
          color: "var(--tm-text-faint)", fontWeight: 500, marginBottom: 10,
        }}>Quick dispatch</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {CATEGORY_ORDER.map((id) => {
            const c = CATEGORIES[id]
            return (
              <button
                key={id}
                type="button"
                onClick={() => open(id)}
                className="hover-lift"
                style={{
                  padding: 14, borderRadius: "var(--tm-radius-sm)",
                  background: "transparent",
                  border: "1px solid var(--tm-border-soft)",
                  color: "var(--tm-text-muted)",
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 12,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = c.color
                  e.currentTarget.style.background = c.wash
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--tm-border-soft)"
                  e.currentTarget.style.background = "transparent"
                }}
              >
                <span style={{ color: c.color, display: "grid", placeItems: "center", filter: `drop-shadow(0 0 4px ${c.color}66)` }}>
                  <CategoryGlyph category={id} size={18} />
                </span>
                <div>
                  <div style={{ fontSize: 13, color: "var(--tm-text)", fontWeight: 600 }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 1 }}>{c.hint}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* SLA footer */}
      <div style={{
        padding: "12px 16px",
        borderRadius: "var(--tm-radius-sm)",
        border: "1px solid var(--tm-border-soft)",
        background: "rgba(255,255,255,0.015)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      }}>
        <div>
          <div style={{
            fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
            color: "var(--tm-text-faint)", fontWeight: 500,
          }}>Response time</div>
          <div style={{ marginTop: 4, fontSize: 13, color: "var(--tm-text)" }}>
            <span style={{ fontFamily: "var(--tm-font-mono)", color: "var(--tm-interactive)", fontWeight: 700 }}>14h</span>
            <span style={{ color: "var(--tm-text-muted)", marginLeft: 6 }}>median this week · 1 human reads</span>
          </div>
        </div>
        <span style={{
          fontSize: 11, color: "var(--tm-text-faint)",
          fontFamily: "var(--tm-font-mono)",
        }}>
          ⌘/ opens this anywhere
        </span>
      </div>
    </div>
  )
}
