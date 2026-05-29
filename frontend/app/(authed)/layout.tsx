import { AppShell } from "@/components/app-shell"

// Mounts the app chrome (top-bar / sidebar / particle bg / forge clock) ONCE for
// every authed surface. Navigating between authed pages keeps this shell mounted —
// only the content below swaps (with the fade in app/(authed)/loading.tsx +
// page-level transitions). Kills the full-screen MYRO-splash reboot that fired
// when each page mounted its own AppShell. Route group is URL-transparent:
// /home, /skills, /cv … are unchanged. AppShell derives active-nav from usePathname.
export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
