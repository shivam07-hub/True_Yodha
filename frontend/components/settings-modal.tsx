"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { billing, jobs, users } from "@/lib/api"
import type { ProfileUpdate, UserProfile } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { XP_POLICY } from "@/lib/xp-policy"
import { useXPStore } from "@/store/xpStore"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { LinkedInIcon } from "@/components/icons/social-icons"
import {
  DndContext, DragOverlay, PointerSensor, closestCenter,
  useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext, arrayMove, horizontalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { L2_CLUSTERS, MAX_TARGET_ROLES } from "@/lib/l2-clusters"
import Link from "next/link"
import {
  CATEGORIES,
  CATEGORY_ORDER,
  CategoryGlyph,
  openFeedbackHub,
  type FeedbackCategory,
} from "@/components/feedback"
import "./settings-modal.css"

type Tab = "Account" | "Following" | "Feedback" | "Billing"
type SidebarProfile = Pick<UserProfile, "full_name" | "email" | "target_roles" | "target_location" | "linkedin_url">
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
const normalizeRoles = (roles: string[]): string[] => {
  const seen = new Set<string>()
  return roles.reduce<string[]>((acc, r) => {
    const t = r.trim()
    if (!t || seen.has(t.toLowerCase()) || acc.length >= MAX_TARGET_ROLES) return acc
    seen.add(t.toLowerCase())
    return [...acc, t]
  }, [])
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

export function SortableRoleChip({
  role, index, onRemove, isOverlay = false,
}: { role: string; index: number; onRemove: (i: number) => void; isOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: role })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform), transition: transition ?? undefined,
        opacity: isDragging ? 0.4 : 1, cursor: isDragging ? "grabbing" : "grab",
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 8px 5px 12px", borderRadius: "var(--tm-radius-pill)",
        background: isDragging ? "transparent" : "var(--tm-int-bg-wash)",
        border: isDragging ? "1px dashed var(--tm-int-border)" : "1px solid var(--tm-int-border)",
        fontSize: 12, color: isDragging ? "transparent" : "var(--tm-interactive)", userSelect: "none",
        boxShadow: isOverlay ? "0 4px 16px rgba(0,0,0,0.4)" : undefined,
      }}
      {...attributes} {...listeners}
    >
      <span style={{ fontWeight: 500 }}>{role}</span>
      <button
        type="button" onClick={(e) => { e.stopPropagation(); onRemove(index) }}
        aria-label={`Remove ${role}`}
        style={{
          width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center",
          justifyContent: "center", background: "var(--tm-int-border-soft)", border: "none",
          padding: 0, cursor: "pointer", color: "var(--tm-interactive)", fontSize: 12, lineHeight: 1,
        }}
      >×</button>
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

export function SettingsModal({ open, onClose, profile }: {
  open: boolean; onClose: () => void; profile: SidebarProfile | null
}) {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const { setBalance } = useXPStore()
  const [activeTab, setActiveTab] = useState<Tab>("Account")

  // Account tab state
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [linkedin, setLinkedin] = useState("")
  const [roles, setRoles] = useState<string[]>([])
  const [roleInput, setRoleInput] = useState("")
  const [roleDropdown, setRoleDropdown] = useState(false)
  const [roleFocused, setRoleFocused] = useState(false)
  const [locationDropdown, setLocationDropdown] = useState(false)
  const [locationFocused, setLocationFocused] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
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

  const roleInputRef = useRef<HTMLInputElement>(null)
  const roleCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    setLocation(profile?.target_location ?? "")
    setLinkedin(profile?.linkedin_url ?? "")
    setRoles(profile?.target_roles?.filter((r) => r.trim()) ?? [])
    setRoleInput(""); setRoleDropdown(false); setRoleFocused(false)
    setLocationDropdown(false); setLocationFocused(false)
    setSaveStatus("idle"); setSaveError(null); setRewardNotice(null)
    setBillingStatus("idle"); setBillingMessage(null); pending.current = {}
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }, [open, profile?.full_name, profile?.target_location, profile?.linkedin_url, profile?.target_roles])

  useEffect(() => () => {
    if (roleCloseTimer.current) clearTimeout(roleCloseTimer.current)
    if (locationCloseTimer.current) clearTimeout(locationCloseTimer.current)
  }, [])

  // Profile save mutation
  const mutation = useMutation({
    mutationFn: (payload: ProfileUpdate) => {
      if (!token) throw new Error("Session not ready — please refresh.")
      return users.updateProfile(token, payload)
    },
    onSuccess: (data) => {
      if (typeof data.new_xp_balance === "number") setBalance(data.new_xp_balance)
      if ((data.xp_earned ?? 0) > 0) setRewardNotice(`+${data.xp_earned} XP earned`)
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

  // Following queries/mutations
  const { data: followingData, isLoading: followingLoading } = useQuery({
    queryKey: ["followedCompanies"],
    queryFn: () => users.followedCompanies(token!),
    enabled: !!token && open && activeTab === "Following",
    staleTime: 60 * 1000,
  })

  const unfollowMutation = useMutation({
    mutationFn: (companyName: string) => users.unfollowCompany(token!, companyName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["followedCompanies"] }),
  })

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
    (name) => !(followingData?.companies ?? []).some((c) => c.company_name.toLowerCase() === name.toLowerCase())
  )

  const followMutation = useMutation({
    mutationFn: (companyName: string) => users.followCompany(token!, companyName),
    onSuccess: (data) => {
      if (typeof data.new_xp_balance === "number") setBalance(data.new_xp_balance)
      queryClient.invalidateQueries({ queryKey: ["followedCompanies"] })
      setCompanyInput("")
      setCompanyDropdown(false)
    },
  })

  function selectCompany(name: string) {
    if (companyCloseTimer.current) clearTimeout(companyCloseTimer.current)
    followMutation.mutate(name)
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

  function saveNow() {
    if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); autosaveTimer.current = null }
    const payload: ProfileUpdate = {
      full_name: normalize(name),
      target_location: normalize(location),
      linkedin_url: normalizeLinkedIn(linkedin),
      target_roles: normalizeRoles(roles),
    }
    pending.current = {}
    setSaveStatus("saving"); setSaveError(null)
    mutation.mutate(payload)
  }

  function handleRolesChange(next: string[]) { setRoles(next); schedule({ target_roles: normalizeRoles(next) }) }
  function removeRole(i: number) { handleRolesChange(roles.filter((_, idx) => idx !== i)) }
  function selectRole(r: string) {
    if (roles.length >= MAX_TARGET_ROLES) return
    handleRolesChange([...roles, r])
    setRoleInput(""); setRoleDropdown(false); roleInputRef.current?.focus()
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  function onDragStart(e: DragStartEvent) { setActiveId(e.active.id as string) }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    handleRolesChange(arrayMove(roles, roles.indexOf(active.id as string), roles.indexOf(over.id as string)))
  }

  const atMax = roles.length >= MAX_TARGET_ROLES
  const suggestions = roleInput.trim()
    ? L2_CLUSTERS.filter((c) => c.toLowerCase().includes(roleInput.toLowerCase()) && !roles.some((r) => r.toLowerCase() === c.toLowerCase())).slice(0, 8)
    : []

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
    const merged = [...cityOptions, ...countryOptions, "Remote", "Hybrid", "Onsite"]
    const seen = new Set<string>()
    return merged.reduce<string[]>((acc, entry) => {
      const normalized = entry.toLowerCase()
      if (seen.has(normalized)) return acc
      seen.add(normalized)
      return [...acc, entry]
    }, [])
  }, [locationCatalogQuery.data])

  const locationSuggestions = useMemo(() => {
    const needle = location.trim().toLowerCase()
    if (!needle) return locationCatalog.slice(0, 10)
    return locationCatalog.filter((entry) => entry.toLowerCase().includes(needle)).slice(0, 10)
  }, [location, locationCatalog])

  function selectLocation(nextLocation: string) {
    setLocation(nextLocation)
    schedule({ target_location: normalize(nextLocation) })
    setLocationDropdown(false)
    locationInputRef.current?.focus()
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
        description: `${XP_PACK_AMOUNT} XP launch pack`,
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
            setBalance(verified.new_xp_balance)
            setBillingStatus("success")
            setBillingMessage(`+${verified.xp_earned} XP added. New balance: ${verified.new_xp_balance} XP.`)
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

  const followedCompanies = followingData?.companies ?? []

  const statusNode = saveStatus === "saving" ? (
    <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>Saving…</span>
  ) : saveStatus === "saved" ? (
    <span style={{ fontSize: 11, color: "var(--tm-success)", fontWeight: 500 }}>✓ Saved</span>
  ) : saveStatus === "error" ? (
    <span style={{ fontSize: 11, color: "var(--tm-danger)", fontWeight: 500 }}>✗ Error</span>
  ) : null

  const liveAnnouncement = saveStatus === "saved"
    ? "Profile saved"
    : saveStatus === "error"
    ? `Save failed: ${saveError ?? "unknown error"}`
    : ""

  const TAB_ICONS: Record<Tab, string> = { Account: "◉", Following: "★", Feedback: "◎", Billing: "▤" }

  return (
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
                  color: activeTab === tab ? "var(--tm-interactive)" : "var(--tm-text-muted)",
                  fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
                  fontFamily: "inherit", textAlign: "left",
                  transition: "all 180ms var(--tm-ease)",
                }}
              >
                <span className="tm-settings-nav-icon" style={{ fontSize: 12, opacity: 0.8 }}>{TAB_ICONS[tab]}</span>
                <span>{tab}</span>
                {tab === "Following" && (followingData?.total ?? 0) > 0 && (
                  <span className="tm-settings-nav-badge" style={{
                    marginLeft: "auto", fontSize: 10, fontWeight: 600,
                    background: "var(--tm-interactive)", color: "var(--tm-interactive-fg)",
                    borderRadius: 99, padding: "1px 6px", minWidth: 18, textAlign: "center",
                  }}>
                    {followingData!.total}
                  </span>
                )}
                {tab === "Feedback" && (
                  <span className="tm-settings-nav-badge" style={{
                    marginLeft: "auto", fontSize: 9, fontWeight: 700,
                    background: "var(--tm-success-wash)", color: "var(--tm-success)",
                    border: "1px solid var(--tm-success)",
                    borderRadius: 99, padding: "1px 6px", letterSpacing: "0.05em",
                  }}>
                    NEW
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Autosave indicator */}
          <div className="tm-settings-autosave" style={{ padding: "14px 20px", borderTop: "1px solid var(--tm-border-soft)", minHeight: 44, display: "flex", alignItems: "center" }}>
            {statusNode ?? <span style={{ fontSize: 11, color: "var(--tm-text-faint)", opacity: 0.5 }}>Auto-saved</span>}
          </div>
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
            <button
              type="button" aria-label="Close settings" onClick={flushAndClose}
              style={{
                background: "transparent", border: "1px solid transparent",
                color: "var(--tm-text-faint)", fontSize: 20, cursor: "pointer",
                lineHeight: 1, padding: "4px 6px", borderRadius: "var(--tm-radius-sm)",
                transition: "color var(--tm-dur), background var(--tm-dur), border-color var(--tm-dur)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-text)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text-faint)"; e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent" }}
            >×</button>
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
                    <div style={ROW_DESC}>Add once to earn +{XP_POLICY.linkedInProfile} XP</div>
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

                {/* Save button */}
                <div style={{ paddingTop: 20, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
                  {rewardNotice && (
                    <span style={{ fontSize: 12, color: "var(--tm-success)", fontWeight: 600 }}>{rewardNotice}</span>
                  )}
                  {saveStatus === "error" && saveError && (
                    <span style={{ fontSize: 12, color: "var(--tm-danger)" }}>{saveError}</span>
                  )}
                  <button type="button" onClick={saveNow} disabled={saveStatus === "saving"}
                    style={{
                      padding: "9px 24px", borderRadius: "var(--tm-radius-sm)", border: "none",
                      background: saveStatus === "saved" ? "var(--tm-success)" : "var(--tm-interactive)",
                      color: "var(--tm-interactive-fg)", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                      cursor: saveStatus === "saving" ? "not-allowed" : "pointer",
                      opacity: saveStatus === "saving" ? 0.65 : 1,
                      transition: "background var(--tm-dur) var(--tm-ease), opacity var(--tm-dur)",
                      minWidth: 100,
                    }}
                  >
                    {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "✓ Saved" : "Save"}
                  </button>
                </div>
              </>
            )}

            {/* ── FOLLOWING TAB ── */}
            {activeTab === "Following" && (
              <>
                {/* Job search section */}
                <div style={SECTION_HEADER}>Job Search</div>

                {/* Target roles */}
                <div style={ROW_STYLE}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div>
                      <div style={ROW_LABEL}>Target Roles</div>
                      <div style={ROW_DESC}>Role types powering your job matches</div>
                    </div>
                    <span style={{ fontSize: 11, color: atMax ? "var(--tm-warning)" : "var(--tm-text-faint)", flexShrink: 0, marginLeft: 12 }}>
                      {roles.length} / {MAX_TARGET_ROLES}
                    </span>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      ref={roleInputRef} type="text" value={roleInput}
                      role="combobox" aria-expanded={roleDropdown && suggestions.length > 0}
                      aria-controls="sm-role-listbox" aria-autocomplete="list" aria-label="Search target roles"
                      onChange={(e) => { setRoleInput(e.target.value); setRoleDropdown(true) }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); if (suggestions[0]) selectRole(suggestions[0]) }
                        if (e.key === "Escape") setRoleDropdown(false)
                      }}
                      onFocus={(e) => { setRoleFocused(true); setRoleDropdown(true); Object.assign(e.currentTarget.style, INPUT_FOCUS_STYLE) }}
                      onBlur={(e) => { roleCloseTimer.current = setTimeout(() => setRoleDropdown(false), 150); setRoleFocused(false); Object.assign(e.currentTarget.style, INPUT_BLUR_STYLE) }}
                      placeholder={atMax ? `Max ${MAX_TARGET_ROLES} selected` : "Search roles…"}
                      disabled={atMax} autoComplete="off"
                      style={{ ...INPUT_STYLE, borderColor: roleFocused ? "var(--tm-int-border)" : "var(--tm-border-soft)", opacity: atMax ? 0.45 : 1 }}
                    />
                    {roleDropdown && suggestions.length > 0 && (
                      <div
                        id="sm-role-listbox" role="listbox" aria-label="Role suggestions"
                        onMouseDown={() => { if (roleCloseTimer.current) clearTimeout(roleCloseTimer.current) }}
                        style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--tm-surface)", border: "1px solid var(--tm-int-border)", borderRadius: "var(--tm-radius-sm)", zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", maxHeight: 220, overflowY: "auto" }}
                      >
                        {suggestions.map((c) => (
                          <button key={c} type="button" role="option" aria-selected={false} onClick={() => selectRole(c)}
                            style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", background: "transparent", border: "none", borderBottom: "1px solid var(--tm-border-soft)", color: "var(--tm-text-muted)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-int-bg-wash)"; e.currentTarget.style.color = "var(--tm-interactive)" }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--tm-text-muted)" }}
                          >{c}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {roles.length > 0 && (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                      <SortableContext items={roles} strategy={horizontalListSortingStrategy}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {roles.map((r, i) => <SortableRoleChip key={r} role={r} index={i} onRemove={removeRole} />)}
                        </div>
                      </SortableContext>
                      <DragOverlay>
                        {activeId ? <SortableRoleChip role={activeId} index={roles.indexOf(activeId)} onRemove={() => {}} isOverlay /> : null}
                      </DragOverlay>
                    </DndContext>
                  )}
                </div>

                {/* Target location */}
                <div style={ROW_STYLE}>
                  <div>
                    <div style={ROW_LABEL}>Target Location</div>
                    <div style={ROW_DESC}>Where you want to work — filters job matches</div>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      ref={locationInputRef} id="sm-location" type="text" value={location}
                      role="combobox" aria-expanded={locationDropdown && locationSuggestions.length > 0}
                      aria-controls="sm-location-listbox" aria-autocomplete="list" aria-label="Search target location"
                      onChange={(e) => { setLocation(e.target.value); schedule({ target_location: normalize(e.target.value) }); setLocationDropdown(true) }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (locationSuggestions[0]) selectLocation(locationSuggestions[0]) } if (e.key === "Escape") setLocationDropdown(false) }}
                      placeholder="City, country, or Remote"
                      style={{ ...INPUT_STYLE, borderColor: locationFocused ? "var(--tm-int-border)" : "var(--tm-border-soft)" }}
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
                          <button key={entry} type="button" role="option" aria-selected={entry === location} onClick={() => selectLocation(entry)}
                            style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", background: "transparent", border: "none", borderBottom: "1px solid var(--tm-border-soft)", color: "var(--tm-text-muted)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-int-bg-wash)"; e.currentTarget.style.color = "var(--tm-interactive)" }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--tm-text-muted)" }}
                          >{entry}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {location.trim() && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 12px", borderRadius: "var(--tm-radius-pill)", background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)", fontSize: 12, color: "var(--tm-interactive)" }}>
                        <span style={{ fontWeight: 500 }}>{location.trim()}</span>
                        <button
                          type="button" onClick={() => selectLocation("")} aria-label="Clear location"
                          style={{ width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--tm-int-border-soft)", border: "none", padding: 0, cursor: "pointer", color: "var(--tm-interactive)", fontSize: 12, lineHeight: 1 }}
                        >×</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Target companies section */}
                <div style={{ ...SECTION_HEADER, marginTop: 32 }}>Target Companies</div>

                {/* Company search combobox — same pattern as Target Roles */}
                <div style={{ ...ROW_STYLE, marginTop: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div>
                      <div style={ROW_LABEL}>Target Companies</div>
                      <div style={ROW_DESC}>
                        Companies whose jobs you track in Market · -{XP_POLICY.followCompanyCost} XP each
                      </div>
                    </div>
                    {followedCompanies.length > 0 && (
                      <span style={{ fontSize: 11, color: "var(--tm-text-faint)", flexShrink: 0, marginLeft: 12 }}>
                        {followedCompanies.length} targeted
                      </span>
                    )}
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
                            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", background: "transparent", border: "none", borderBottom: "1px solid var(--tm-border-soft)", color: "var(--tm-text-muted)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-int-bg-wash)"; e.currentTarget.style.color = "var(--tm-interactive)" }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--tm-text-muted)" }}
                          >
                            <CompanyAvatar name={name} />
                            <span style={{ flex: 1 }}>{name}</span>
                            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, color: "var(--tm-interactive)", whiteSpace: "nowrap" }}>
                              -{XP_POLICY.followCompanyCost} XP
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Followed companies list */}
                {followingLoading ? (
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
                      No companies followed yet. Following costs {XP_POLICY.followCompanyCost} XP.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {followedCompanies.map((company) => (
                      <div key={company.company_name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 12px", borderRadius: "var(--tm-radius-pill)", background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)", fontSize: 12, color: "var(--tm-interactive)" }}>
                        <Link href="/market" onClick={flushAndClose} style={{ fontWeight: 500, color: "var(--tm-interactive)", textDecoration: "none" }}>
                          {company.company_name}
                        </Link>
                        <button
                          type="button"
                          onClick={() => unfollowMutation.mutate(company.company_name)}
                          disabled={unfollowMutation.isPending}
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
  )
}

// ── Billing tab content ────────────────────────────────────────────────────

function BillingTabContent({
  status,
  message,
  onBuy,
}: {
  status: BillingStatus
  message: string | null
  onBuy: () => void
}) {
  const busy = status === "creating" || status === "verifying"
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
      <div style={SECTION_HEADER}>XP packs</div>

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
              {XP_PACK_AMOUNT.toLocaleString()} XP
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.5, maxWidth: 360 }}>
              Use XP for company follows, match refreshes, and focused forge sessions.
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
        <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
          Test mode
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
        <button
          type="button"
          onClick={() => open()}
          style={{
            marginTop: 14,
            padding: "10px 18px", borderRadius: "var(--tm-radius-sm)",
            background: "var(--tm-interactive)", color: "var(--tm-interactive-fg)",
            border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 0 18px var(--tm-int-bg-hover)",
            display: "inline-flex", alignItems: "center", gap: 8,
          }}
        >
          Open feedback hub <span>↗</span>
        </button>
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
