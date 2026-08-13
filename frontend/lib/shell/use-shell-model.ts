"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/lib/hooks/use-auth"
import { users, xp, type UserProfile } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { readIdentitySnapshot, writeIdentitySnapshot } from "@/lib/identity-cache"
import { reconcileAccentFromServer } from "@/lib/hooks/use-accent"
import { useXPStore } from "@/store/xpStore"
import {
  OPEN_FEEDBACK_EVENT,
  type FeedbackCategory,
  type OpenFeedbackDetail,
} from "@/components/feedback"
import type { SidebarProfile } from "@/lib/shell/contract"

export type FeedbackHubTab = "new" | "reports" | "shipped"

/** The shell model shape — consumed by every chrome adapter (web strip, mobile
 *  bars) and the shared AuthedTopStrip so it can mount in any layout. */
export type ShellModel = ReturnType<typeof useShellModel>

/**
 * The platform-neutral shell model (ADR-0010). Owns the state every shell
 * adapter needs — XP balance, the chrome profile, feedback-hub + XP-modal +
 * mobile-sheet open state, and the ambient-XP claim handler — independent of
 * whether the chrome is the web top bar or the mobile bars (or, later, the
 * native APK). Both adapters read from this; neither owns it.
 *
 * The interface is the test surface: drive this hook, assert the model,
 * without rendering any chrome.
 */
export function useShellModel() {
  const { token, ready, signOut } = useAuth()
  const { balance: xpBalance, setBalance: setXPBalance } = useXPStore()

  const [xpModalOpen, setXPModalOpen] = useState(false)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [feedbackHubOpen, setFeedbackHubOpen] = useState(false)
  const [feedbackHubCategory, setFeedbackHubCategory] = useState<FeedbackCategory>("bug")
  const [feedbackHubTab, setFeedbackHubTab] = useState<FeedbackHubTab>("new")

  // Hydrate the persisted XP balance on the client (the store uses skipHydration
  // to avoid an SSR/client number mismatch) so the topbar shows the last-known
  // balance immediately, before the authoritative fetch below resolves.
  useEffect(() => {
    void useXPStore.persist.rehydrate()
  }, [])

  // Refresh the authoritative XP balance once a token is present.
  useEffect(() => {
    if (!token) return
    xp.balance(token).then((r) => setXPBalance(r.balance)).catch(() => {})
  }, [token, setXPBalance])

  // Global "open feedback" event (fired from anywhere via openFeedbackHub()).
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<OpenFeedbackDetail>).detail ?? {}
      if (detail.category) setFeedbackHubCategory(detail.category)
      if (detail.tab) setFeedbackHubTab(detail.tab)
      setFeedbackHubOpen(true)
    }
    document.addEventListener(OPEN_FEEDBACK_EVENT, handler)
    return () => document.removeEventListener(OPEN_FEEDBACK_EVENT, handler)
  }, [])

  // ⌘/ Ctrl+/ toggles the feedback hub.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") { e.preventDefault(); setFeedbackHubOpen((o) => !o) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // SWR-persist (#41 L2): seed the nav's name from last session so a returning
  // user sees it instantly, then refetch. The old timestamp keeps it stale so
  // the background revalidation still fires.
  const profileSnapshot = useMemo(
    () => readIdentitySnapshot<UserProfile>("profile", token),
    [token],
  )
  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
    initialData: profileSnapshot?.data,
    initialDataUpdatedAt: profileSnapshot?.ts,
  })
  useEffect(() => {
    if (profileData) writeIdentitySnapshot("profile", token, profileData)
  }, [profileData, token])

  // ND15: server accent_pref is the cross-device source of truth; sync it into
  // the per-device localStorage cache once the profile loads (no-op if already
  // matching — never clobbers a same-session toggle mid-flight).
  useEffect(() => {
    if (profileData?.accent_pref) reconcileAccentFromServer(profileData.accent_pref)
  }, [profileData?.accent_pref])

  const profile: SidebarProfile = {
    full_name: profileData?.full_name ?? null,
    email: profileData?.email ?? "",
    target_roles: profileData?.target_roles ?? [],
    target_role_title: profileData?.target_role_title ?? null,
    target_role_titles: profileData?.target_role_titles ?? [],
    target_location: profileData?.target_location ?? null,
    target_locations: profileData?.target_locations ?? [],
    linkedin_url: profileData?.linkedin_url ?? null,
    ninja_name: profileData?.ninja_name ?? null,
  }

  return {
    token,
    ready,
    signOut,
    xpBalance,
    profile,
    profileLoading,
    xpModalOpen,
    setXPModalOpen,
    mobileSheetOpen,
    setMobileSheetOpen,
    feedbackHubOpen,
    setFeedbackHubOpen,
    feedbackHubCategory,
    setFeedbackHubCategory,
    feedbackHubTab,
    setFeedbackHubTab,
  }
}
