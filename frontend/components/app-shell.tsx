"use client"

import { usePathname } from "next/navigation"

import { ParticleBg } from "@/components/particle-bg"
import { ForgeClockDriver } from "@/components/forge/ForgeClockDriver"
import { XPGateModal } from "@/components/xp/XPGateModal"
import { XpExplainerModal } from "@/components/xp/xp-explainer-modal"
import { WebChrome } from "@/components/shell/web-chrome"
import { FeedbackHub, FeedbackFAB } from "@/components/feedback"
import { skeletonForPath } from "@/components/loading/page-skeletons"
import { useShellModel } from "@/lib/shell/use-shell-model"
import { useNavUnlocks } from "@/lib/hooks/use-nav-unlocks"
import {
  MobileBottomNav,
  MobileProfileSheet,
  MobileTopBar,
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

const SUPPRESS_PARTICLE_PATHS = ["/market", "/cv", "/skills", "/home", "/forge", "/tokens", "/xp"]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isDesktop } = useViewport()
  const m = useShellModel()
  // No CV uploaded yet → the feedback FAB renders neutral so the first-run
  // Upload CTA owns the only accent on the page (D2). Cache-shared queries.
  const { hasCv } = useNavUnlocks()

  // Auth bootstrap window — before chrome/profile can render. Show the
  // destination page's own skeleton shape rather than a centered logo splash,
  // so the perceived load is continuous: shell-bootstrap skeleton → page
  // skeleton → real content, all in the same layout.
  //
  // Gate on token too: when bootstrap finished with no session (ready && !token)
  // useAuth has fired router.replace(/login?next=…). Holding the skeleton during
  // that redirect-in-flight window stops authed children rendering token-less
  // (Backlog #16 — logged-out visitor landed on a blank /tracker).
  if (!m.ready || !m.token) return <>{skeletonForPath(pathname)}</>

  const showParticle = isDesktop && !SUPPRESS_PARTICLE_PATHS.some((p) => pathname.startsWith(p))

  return (
    <div className="tm-shell-enter" style={{ display: "flex", flexDirection: "column", height: "100dvh", width: "100vw", overflow: "hidden", position: "relative" }}>
      {showParticle && <ParticleBg />}
      <ForgeClockDriver />
      <XPGateModal />

      {isDesktop && (
        <WebChrome
          xpBalance={m.xpBalance}
          profile={m.profile}
          signOut={m.signOut}
          onForgeXPEarned={m.handleAmbientXPEarned}
          onXPOpen={() => m.setXPModalOpen(true)}
        />
      )}

      <MobileTopBar
        xpBalance={m.xpBalance}
        profile={m.profile}
        onAvatarClick={() => m.setMobileSheetOpen(true)}
        onXPOpen={() => m.setXPModalOpen(true)}
      />

      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", zIndex: 2 }}>
        <div className="tm-page-enter tm-main-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {children}
        </div>
      </main>

      <MobileBottomNav />

      {m.mobileSheetOpen && (
        <MobileProfileSheet
          profile={m.profile}
          onClose={() => m.setMobileSheetOpen(false)}
          signOut={m.signOut}
        />
      )}

      <XpExplainerModal open={m.xpModalOpen} onClose={() => m.setXPModalOpen(false)} balance={m.xpBalance} />

      <FeedbackFAB
        hidden={!isDesktop || m.feedbackHubOpen}
        subdued={!hasCv}
        pulse={hasCv}
        onOpen={(category) => {
          if (category) m.setFeedbackHubCategory(category)
          m.setFeedbackHubTab("new")
          m.setFeedbackHubOpen(true)
        }}
      />

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
  )
}
