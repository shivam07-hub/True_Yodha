"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { users } from "@/lib/api"
import type { ProfileUpdate, UserProfile } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
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

type SidebarProfile = Pick<UserProfile, "full_name" | "target_roles" | "target_location" | "linkedin_url">
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

export function SettingsModal({ open, onClose, profile }: {
  open: boolean; onClose: () => void; profile: SidebarProfile | null
}) {
  const { token } = useAuth()
  const queryClient = useQueryClient()

  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [linkedin, setLinkedin] = useState("")
  const [roles, setRoles] = useState<string[]>([])
  const [roleInput, setRoleInput] = useState("")
  const [roleDropdown, setRoleDropdown] = useState(false)
  const [roleFocused, setRoleFocused] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [saveError, setSaveError] = useState<string | null>(null)

  const roleInputRef = useRef<HTMLInputElement>(null)
  const roleCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    setSaveStatus("idle"); setSaveError(null); pending.current = {}
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }, [open, profile?.full_name, profile?.target_location, profile?.linkedin_url, profile?.target_roles])

  const mutation = useMutation({
    mutationFn: (payload: ProfileUpdate) => {
      if (!token) throw new Error("Session not ready — please refresh.")
      return users.updateProfile(token, payload)
    },
    onSuccess: () => {
      if (token) queryClient.invalidateQueries({ queryKey: dataKeys.profile(token) })
      setSaveStatus("saved"); setSaveError(null)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSaveStatus("idle"), SAVED_DISPLAY_MS)
    },
    onError: (err) => {
      setSaveStatus("error")
      setSaveError(err instanceof Error ? err.message : "Could not save")
    },
  })

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

  const allEmpty = !profile?.full_name && !profile?.target_location && !profile?.linkedin_url &&
    (!profile?.target_roles || profile.target_roles.length === 0)

  const statusNode = saveStatus === "saving" ? (
    <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>saving…</span>
  ) : saveStatus === "saved" ? (
    <span style={{ fontSize: 11, color: "var(--tm-success)", fontWeight: 500 }}>✓ saved</span>
  ) : saveStatus === "error" ? (
    <span style={{ fontSize: 11, color: "var(--tm-danger)", fontWeight: 500 }}>✗ error</span>
  ) : null

  const liveAnnouncement = saveStatus === "saved"
    ? "Profile saved"
    : saveStatus === "error"
    ? `Save failed: ${saveError ?? "unknown error"}`
    : ""

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) flushAndClose() }}>
      <DialogContent showCloseButton={false}
        className="sm:max-w-[620px] max-w-[calc(100%-2rem)] p-0 bg-transparent ring-0"
        style={{
          background: "var(--tm-surface)", border: "1px solid var(--tm-accent-ring)",
          borderRadius: "var(--tm-radius-xl)", boxShadow: "0 0 50px rgba(0,0,0,0.6)",
          maxHeight: "82dvh", display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Screen-reader live region for save status */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">{liveAnnouncement}</div>

        {/* Sticky header */}
        <div style={{
          padding: "20px 24px 16px", borderBottom: "1px solid var(--tm-border-soft)",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          gap: 16, flexShrink: 0,
        }}>
          <div>
            <div className="tm-label-caps" style={{ fontSize: 11, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              Settings
              {statusNode && <span style={{ fontVariantCaps: "normal", textTransform: "none", letterSpacing: "normal", fontWeight: 400 }}>— {statusNode}</span>}
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--tm-text)", margin: 0, textWrap: "balance" } as React.CSSProperties}>User Information</h2>
          </div>
          <button type="button" aria-label="Close settings" onClick={flushAndClose}
            style={{ background: "transparent", border: "1px solid transparent", color: "var(--tm-text-faint)", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "4px 6px", borderRadius: "var(--tm-radius-sm)", flexShrink: 0, transition: "color var(--tm-dur), background var(--tm-dur), border-color var(--tm-dur)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-text)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text-faint)"; e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent" }}
          >×</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {allEmpty && (
            <div style={{ padding: "14px 16px", borderRadius: "var(--tm-radius)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tm-accent)", marginBottom: 4 }}>Welcome to Myro</div>
              <div style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.6, textWrap: "pretty" } as React.CSSProperties}>
                Set up your profile in 30 seconds — your target roles and location power your job matches.
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="sm-ninja-name" className="tm-label-caps" style={{ fontSize: 11 }}>Ninja Name</label>
            <input id="sm-ninja-name" type="text" value={name} onChange={(e) => { setName(e.target.value); schedule({ full_name: normalize(e.target.value) }) }}
              placeholder="Your display name" style={INPUT_STYLE}
              onFocus={(e) => Object.assign(e.currentTarget.style, INPUT_FOCUS_STYLE)}
              onBlur={(e) => Object.assign(e.currentTarget.style, INPUT_BLUR_STYLE)}
            />
          </div>

          <div style={{ border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="tm-label-caps" style={{ fontSize: 11 }}>Target Roles</span>
              <span style={{ fontSize: 11, color: atMax ? "var(--tm-warning)" : "var(--tm-text-faint)", fontVariantNumeric: "tabular-nums" }}>{roles.length} / {MAX_TARGET_ROLES}</span>
            </div>
            <div style={{ position: "relative" }}>
              <input
                ref={roleInputRef} type="text" value={roleInput}
                role="combobox" aria-expanded={roleDropdown && suggestions.length > 0}
                aria-controls="sm-role-listbox" aria-autocomplete="list"
                aria-label="Search target roles"
                onChange={(e) => { setRoleInput(e.target.value); setRoleDropdown(true) }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (suggestions[0]) selectRole(suggestions[0]) } if (e.key === "Escape") setRoleDropdown(false) }}
                onFocus={(e) => { setRoleFocused(true); setRoleDropdown(true); Object.assign(e.currentTarget.style, INPUT_FOCUS_STYLE) }}
                onBlur={(e) => { roleCloseTimer.current = setTimeout(() => setRoleDropdown(false), 150); setRoleFocused(false); Object.assign(e.currentTarget.style, INPUT_BLUR_STYLE) }}
                placeholder={atMax ? `Max ${MAX_TARGET_ROLES} selected` : "Search target roles…"}
                disabled={atMax} autoComplete="off"
                style={{ ...INPUT_STYLE, borderColor: roleFocused ? "var(--tm-accent-ring)" : "var(--tm-border-soft)", opacity: atMax ? 0.45 : 1 }}
              />
              {roleDropdown && suggestions.length > 0 && (
                <div id="sm-role-listbox" role="listbox" aria-label="Role suggestions"
                  onMouseDown={() => { if (roleCloseTimer.current) clearTimeout(roleCloseTimer.current) }}
                  style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--tm-surface)", border: "1px solid var(--tm-accent-ring)", borderRadius: "var(--tm-radius-sm)", zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", maxHeight: 240, overflowY: "auto" }}
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
            ) : <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>No target roles selected yet.</div>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="sm-location" className="tm-label-caps" style={{ fontSize: 11 }}>Target Location</label>
            <input id="sm-location" type="text" value={location} onChange={(e) => { setLocation(e.target.value); schedule({ target_location: normalize(e.target.value) }) }}
              placeholder="City, country, or Remote" style={INPUT_STYLE}
              onFocus={(e) => Object.assign(e.currentTarget.style, INPUT_FOCUS_STYLE)}
              onBlur={(e) => Object.assign(e.currentTarget.style, INPUT_BLUR_STYLE)}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="sm-linkedin" className="tm-label-caps" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
              <LinkedInIcon size={13} aria-hidden />LinkedIn
            </label>
            <input id="sm-linkedin" type="url" value={linkedin} onChange={(e) => { setLinkedin(e.target.value); schedule({ linkedin_url: normalizeLinkedIn(e.target.value) }) }}
              placeholder="linkedin.com/in/your-profile" style={INPUT_STYLE}
              onFocus={(e) => Object.assign(e.currentTarget.style, INPUT_FOCUS_STYLE)}
              onBlur={(e) => Object.assign(e.currentTarget.style, INPUT_BLUR_STYLE)}
            />
          </div>

          {/* Explicit save */}
          <div style={{ paddingTop: 8, borderTop: "1px solid var(--tm-border-soft)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
            {saveStatus === "error" && saveError && (
              <span style={{ fontSize: 12, color: "var(--tm-danger)" }}>{saveError}</span>
            )}
            <button type="button" onClick={saveNow} disabled={saveStatus === "saving"}
              style={{
                padding: "9px 22px", borderRadius: "var(--tm-radius-sm)", border: "none",
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
