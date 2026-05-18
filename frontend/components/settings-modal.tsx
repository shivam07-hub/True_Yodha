"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { jobs, users } from "@/lib/api"
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

type Tab = "Account" | "Following"
type SidebarProfile = Pick<UserProfile, "full_name" | "email" | "target_roles" | "target_location" | "linkedin_url">
type SaveStatus = "idle" | "saving" | "saved" | "error"

const AUTOSAVE_MS = 800
const SAVED_DISPLAY_MS = 2000

const normalize = (v: string): string | null => v.trim() || null
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
      background: "var(--tm-accent)", color: "var(--tm-accent-fg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.38), fontWeight: 700, letterSpacing: "-0.02em",
      boxShadow: "0 0 16px var(--tm-accent-glow)",
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
        background: isDragging ? "transparent" : "var(--tm-accent-wash)",
        border: isDragging ? "1px dashed var(--tm-accent-ring)" : "1px solid var(--tm-accent-ring)",
        fontSize: 12, color: isDragging ? "transparent" : "var(--tm-accent)", userSelect: "none",
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
          justifyContent: "center", background: "rgba(0,245,212,0.15)", border: "none",
          padding: 0, cursor: "pointer", color: "var(--tm-accent)", fontSize: 12, lineHeight: 1,
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
const INPUT_FOCUS_STYLE = { borderColor: "var(--tm-accent-ring)", boxShadow: "0 0 0 2px var(--tm-accent-glow)" }
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

  // Following tab state
  const [companyInput, setCompanyInput] = useState("")
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
    setSaveStatus("idle"); setSaveError(null); pending.current = {}
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
    onSuccess: () => {
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

  const { data: companySuggestions = [] } = useQuery({
    queryKey: ["companySuggestions", companyInput],
    queryFn: () => jobs.searchCompanies(companyInput),
    enabled: companyInput.trim().length >= 2,
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

  const TAB_ICONS: Record<Tab, string> = { Account: "◉", Following: "★" }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) flushAndClose() }}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[740px] max-w-[calc(100%-1.5rem)] p-0 bg-transparent ring-0"
        style={{
          background: "var(--tm-surface)", border: "1px solid var(--tm-accent-ring)",
          borderRadius: "var(--tm-radius-xl)", boxShadow: "0 0 60px rgba(0,0,0,0.65)",
          height: "88dvh", maxHeight: 820,
          display: "flex", overflow: "hidden",
        }}
      >
        <div aria-live="polite" aria-atomic="true" className="sr-only">{liveAnnouncement}</div>

        {/* ── Left sidebar ── */}
        <div style={{
          width: 200, flexShrink: 0,
          borderRight: "1px solid var(--tm-border-soft)",
          display: "flex", flexDirection: "column",
          background: "rgba(255,255,255,0.015)",
        }}>
          {/* Profile card */}
          <div style={{ padding: "28px 20px 20px", borderBottom: "1px solid var(--tm-border-soft)" }}>
            <InitialsAvatar name={name || "?"} size={52} />
            <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: "var(--tm-text)", lineHeight: 1.3 }}>
              {name || "Set your name"}
            </div>
            <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 4, wordBreak: "break-all" }}>
              {profile?.email ?? ""}
            </div>
          </div>

          {/* Nav tabs */}
          <nav style={{ padding: "12px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            {(["Account", "Following"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "10px 12px", borderRadius: "var(--tm-radius-sm)", cursor: "pointer",
                  background: activeTab === tab ? "var(--tm-accent-wash)" : "transparent",
                  border: `1px solid ${activeTab === tab ? "var(--tm-accent-ring)" : "transparent"}`,
                  color: activeTab === tab ? "var(--tm-accent)" : "var(--tm-text-muted)",
                  fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
                  fontFamily: "inherit", textAlign: "left",
                  transition: "all 180ms var(--tm-ease)",
                }}
              >
                <span style={{ fontSize: 12, opacity: 0.8 }}>{TAB_ICONS[tab]}</span>
                {tab}
                {tab === "Following" && (followingData?.total ?? 0) > 0 && (
                  <span style={{
                    marginLeft: "auto", fontSize: 10, fontWeight: 600,
                    background: "var(--tm-accent)", color: "var(--tm-accent-fg)",
                    borderRadius: 99, padding: "1px 6px", minWidth: 18, textAlign: "center",
                  }}>
                    {followingData!.total}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Autosave indicator */}
          <div style={{ padding: "14px 20px", borderTop: "1px solid var(--tm-border-soft)", minHeight: 44, display: "flex", alignItems: "center" }}>
            {statusNode ?? <span style={{ fontSize: 11, color: "var(--tm-text-faint)", opacity: 0.5 }}>Auto-saved</span>}
          </div>
        </div>

        {/* ── Right content ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {/* Tab header */}
          <div style={{
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
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 28px 28px" }}>

            {/* ── ACCOUNT TAB ── */}
            {activeTab === "Account" && (
              <>
                {/* Profile section */}
                <div style={SECTION_HEADER}>Profile</div>

                <div style={ROW_STYLE}>
                  <div>
                    <div style={ROW_LABEL}>Email</div>
                    <div style={ROW_DESC}>Tied to your account · cannot be changed here</div>
                  </div>
                  <input
                    id="sm-email" type="email" value={profile?.email ?? ""} readOnly disabled
                    aria-readonly="true"
                    style={{ ...INPUT_STYLE, opacity: 0.7, cursor: "not-allowed" }}
                  />
                </div>

                <div style={ROW_STYLE}>
                  <div>
                    <div style={ROW_LABEL}>Ninja Name</div>
                    <div style={ROW_DESC}>Your display name across Myro · optional</div>
                  </div>
                  <input
                    id="sm-ninja-name" type="text" value={name}
                    onChange={(e) => { setName(e.target.value); schedule({ full_name: normalize(e.target.value) }) }}
                    placeholder="Your display name"
                    style={INPUT_STYLE}
                    onFocus={(e) => Object.assign(e.currentTarget.style, INPUT_FOCUS_STYLE)}
                    onBlur={(e) => Object.assign(e.currentTarget.style, INPUT_BLUR_STYLE)}
                  />
                </div>

                <div style={{ ...ROW_STYLE, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={ROW_LABEL}>LinkedIn</div>
                    <div style={ROW_DESC}>Linked to your profile</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, maxWidth: "55%" }}>
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
                  {saveStatus === "error" && saveError && (
                    <span style={{ fontSize: 12, color: "var(--tm-danger)" }}>{saveError}</span>
                  )}
                  <button type="button" onClick={saveNow} disabled={saveStatus === "saving"}
                    style={{
                      padding: "9px 24px", borderRadius: "var(--tm-radius-sm)", border: "none",
                      background: saveStatus === "saved" ? "var(--tm-success)" : "var(--tm-accent)",
                      color: "var(--tm-accent-fg)", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
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
                      style={{ ...INPUT_STYLE, borderColor: roleFocused ? "var(--tm-accent-ring)" : "var(--tm-border-soft)", opacity: atMax ? 0.45 : 1 }}
                    />
                    {roleDropdown && suggestions.length > 0 && (
                      <div
                        id="sm-role-listbox" role="listbox" aria-label="Role suggestions"
                        onMouseDown={() => { if (roleCloseTimer.current) clearTimeout(roleCloseTimer.current) }}
                        style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--tm-surface)", border: "1px solid var(--tm-accent-ring)", borderRadius: "var(--tm-radius-sm)", zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", maxHeight: 220, overflowY: "auto" }}
                      >
                        {suggestions.map((c) => (
                          <button key={c} type="button" role="option" aria-selected={false} onClick={() => selectRole(c)}
                            style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", background: "transparent", border: "none", borderBottom: "1px solid var(--tm-border-soft)", color: "var(--tm-text-muted)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-accent-wash)"; e.currentTarget.style.color = "var(--tm-accent)" }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--tm-text-muted)" }}
                          >{c}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {roles.length > 0 ? (
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
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--tm-text-faint)", fontStyle: "italic" }}>No target roles yet — search above to add</div>
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
                      style={{ ...INPUT_STYLE, borderColor: locationFocused ? "var(--tm-accent-ring)" : "var(--tm-border-soft)" }}
                      onFocus={(e) => { setLocationFocused(true); setLocationDropdown(true); Object.assign(e.currentTarget.style, INPUT_FOCUS_STYLE) }}
                      onBlur={(e) => { locationCloseTimer.current = setTimeout(() => setLocationDropdown(false), 150); setLocationFocused(false); Object.assign(e.currentTarget.style, INPUT_BLUR_STYLE) }}
                    />
                    {locationDropdown && locationSuggestions.length > 0 && (
                      <div
                        id="sm-location-listbox" role="listbox" aria-label="Location suggestions"
                        onMouseDown={() => { if (locationCloseTimer.current) clearTimeout(locationCloseTimer.current) }}
                        style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--tm-surface)", border: "1px solid var(--tm-accent-ring)", borderRadius: "var(--tm-radius-sm)", zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", maxHeight: 220, overflowY: "auto" }}
                      >
                        {locationSuggestions.map((entry) => (
                          <button key={entry} type="button" role="option" aria-selected={entry === location} onClick={() => selectLocation(entry)}
                            style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", background: "transparent", border: "none", borderBottom: "1px solid var(--tm-border-soft)", color: "var(--tm-text-muted)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-accent-wash)"; e.currentTarget.style.color = "var(--tm-accent)" }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--tm-text-muted)" }}
                          >{entry}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {location.trim() ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 12px", borderRadius: "var(--tm-radius-pill)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)", fontSize: 12, color: "var(--tm-accent)" }}>
                        <span style={{ fontWeight: 500 }}>{location.trim()}</span>
                        <button
                          type="button" onClick={() => selectLocation("")} aria-label="Clear location"
                          style={{ width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,245,212,0.15)", border: "none", padding: 0, cursor: "pointer", color: "var(--tm-accent)", fontSize: 12, lineHeight: 1 }}
                        >×</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--tm-text-faint)", fontStyle: "italic" }}>No location set — search above to add</div>
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
                      style={{ ...INPUT_STYLE, borderColor: companyFocused ? "var(--tm-accent-ring)" : "var(--tm-border-soft)" }}
                    />
                    {companyDropdown && filteredSuggestions.length > 0 && (
                      <div
                        id="sm-company-listbox"
                        role="listbox"
                        aria-label="Company suggestions"
                        onMouseDown={() => { if (companyCloseTimer.current) clearTimeout(companyCloseTimer.current) }}
                        style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--tm-surface)", border: "1px solid var(--tm-accent-ring)", borderRadius: "var(--tm-radius-sm)", zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", maxHeight: 220, overflowY: "auto" }}
                      >
                        {filteredSuggestions.map((name) => (
                          <button
                            key={name}
                            type="button"
                            role="option"
                            aria-selected={false}
                            onClick={() => selectCompany(name)}
                            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", background: "transparent", border: "none", borderBottom: "1px solid var(--tm-border-soft)", color: "var(--tm-text-muted)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-accent-wash)"; e.currentTarget.style.color = "var(--tm-accent)" }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--tm-text-muted)" }}
                          >
                            <CompanyAvatar name={name} />
                            <span style={{ flex: 1 }}>{name}</span>
                            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, color: "var(--tm-accent)", whiteSpace: "nowrap" }}>
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
                    <div style={{ fontSize: 28, opacity: 0.2, color: "var(--tm-accent)" }}>★</div>
                    <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>
                      No companies followed yet. Following costs {XP_POLICY.followCompanyCost} XP.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {followedCompanies.map((company) => (
                      <div key={company.company_name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 12px", borderRadius: "var(--tm-radius-pill)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)", fontSize: 12, color: "var(--tm-accent)" }}>
                        <Link href="/market" onClick={flushAndClose} style={{ fontWeight: 500, color: "var(--tm-accent)", textDecoration: "none" }}>
                          {company.company_name}
                        </Link>
                        <button
                          type="button"
                          onClick={() => unfollowMutation.mutate(company.company_name)}
                          disabled={unfollowMutation.isPending}
                          aria-label={`Unfollow ${company.company_name}`}
                          style={{ width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,245,212,0.15)", border: "none", padding: 0, cursor: "pointer", color: "var(--tm-accent)", fontSize: 12, lineHeight: 1 }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
