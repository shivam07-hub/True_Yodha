"use client"

import "@/mobile/redesign/redesign.css"
import { usePathname } from "next/navigation"

import { XPGateModal } from "@/components/xp/XPGateModal"
import { XpExplainerModal } from "@/components/xp/xp-explainer-modal"
import { AuthedTopStrip } from "@/components/shell/authed-top-strip"
import { FeedbackHub } from "@/components/feedback"
import { skeletonForPath } from "@/components/loading/page-skeletons"
import { useShellModel } from "@/lib/shell/use-shell-model"
import { usePendingJobSaveClaim } from "@/lib/hooks/use-pending-job-save-claim"
import {
  MobileBottomNav,
  MobileTopBar,
  MobileUIProvider,
  PracticeSheet,
  useViewport,
} from "@/mobile"

export type { SidebarProfile } from "@/lib/shell/contract"

/**
 * AppShell — the platform-shell SEAM (ADR-0010). Picks the chrome adapter for
 * the current surface and mounts the shared overlays. All shared state lives in
 * useShellModel; the web chrome lives in <WebChrome> (components/shell), the
 * mobile chrome in <MobileTopBar>/<MobileBottomNav> (mobile/shell). Neither
 * adapter imports the other.
 *
 * Visibility is intentionally CSS-driven (web chrome JS-gated on isDesktop,
 * mobile bars hidden by @media): useViewport resolves to mobile on first paint,
 * so swapping to JS-only mounting would flash the wrong chrome. The native APK
 * reuses useShellModel + the mobile chrome, never this file.
 */

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isDesktop } = useViewport()
  const m = useShellModel()

  // Replay a job saved while logged out (Exception 2). Mounted on the shell, not
  // on /collections, because postAuthDestination only lands there when the job
  // save is the TOP intent — an anon CV outranks it, so a user who dropped a CV
  // and saved a role in the same session lands on /cv and would otherwise never
  // consume the stash. The replay is idempotent and clears its own stash.
  usePendingJobSaveClaim(m.token)

  // Auth bootstrap window — before chrome/profile can render. Show the
  // destination page's own skeleton shape rather than a centered logo splash,
  // so the perceived load is continuous: shell-bootstrap skeleton → page
  // skeleton → real content, all in the same layout.
  //
  // Gate on token too: when bootstrap finished with no session (ready && !token)
  // useAuth has fired router.replace(/login). Holding the skeleton during
  // that redirect-in-flight window stops authed children rendering token-less
  // (Backlog #16 — logged-out visitor landed on a blank /tracker).
  if (!m.ready || !m.token) return <>{skeletonForPath(pathname)}</>

  return (
    <MobileUIProvider>
    <div className="tm-page-canvas tm-shell-enter" style={{ display: "flex", flexDirection: "column", height: "100dvh", width: "100vw", overflow: "hidden", position: "relative" }}>
      <XPGateModal />
      {isDesktop && (
        <>
          {/* The ONE logged-in strip — the SAME component the public bar's
              authed branch mounts (components/public/top-nav). AppShell already
              hosts the FeedbackHub below, so the strip doesn't re-mount it. */}
          <AuthedTopStrip model={m} mountFeedbackHub={false} />
          {/* The Loop Bar strip is gone (unified-structure S1): the loop lives in
              the nav itself — journey-ordered tabs + live counts + score chip. */}
        </>
      )}

      <MobileTopBar />

      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", zIndex: 2 }}>
        <div className="tm-page-enter tm-main-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {children}
        </div>
      </main>

      <MobileBottomNav />

      {/* Practice sheet (top-bar bolt) — mobile-only, gated on open state. */}
      {!isDesktop && <PracticeSheet />}

      <XpExplainerModal open={m.xpModalOpen} onClose={() => m.setXPModalOpen(false)} balance={m.xpBalance} />

      {/* Feedback is no longer a floating FAB — it lives in the avatar menu
          (web-chrome) + mobile drawer, opened via openFeedbackHub(). The Hub
          modal itself stays mounted here as the single event-driven surface. */}
      <FeedbackHub
        open={m.feedbackHubOpen}
        onClose={() => m.setFeedbackHubOpen(false)}
        defaultCategory={m.feedbackHubCategory}
        defaultTab={m.feedbackHubTab}
        showHistory={!!m.token}
        showContext
        userName={m.profile.full_name}
        userEmail={m.profile.email}
      />
    </div>
    </MobileUIProvider>
  )
}
