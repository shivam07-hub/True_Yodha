import { AppShell } from "@/components/app-shell"
import { ParticleMomentProvider } from "@/components/particle"

// Mounts the app chrome (top-bar / sidebar / particle bg / forge clock) ONCE for
// every authed surface. Navigating between authed pages keeps this shell mounted —
// only the content below swaps (with the fade in app/(authed)/loading.tsx +
// page-level transitions). Kills the full-screen MYRO-splash reboot that fired
// when each page mounted its own AppShell. Route group is URL-transparent:
// /home, /skills, /cv … are unchanged. AppShell derives active-nav from usePathname.
//
// ParticleMomentProvider wraps the shell so any authed page can fire a one-shot
// celebration burst via useParticleMoment() at a WOW peak (CV processed, first
// match, skill level-up). Desktop + motion gating lives inside the provider.
export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ParticleMomentProvider>
      <AppShell>{children}</AppShell>
    </ParticleMomentProvider>
  )
}
