"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, BookOpen, Briefcase, FileText, Globe, LogOut } from "lucide-react"
import { useAuth } from "@/lib/hooks/use-auth"
import { TruthMirrorLogo } from "@/components/truth-mirror-logo"

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/tracker",   label: "Jobs",      icon: Briefcase  },
  { href: "/market",    label: "Intel",     icon: Globe      },
  { href: "/diary",     label: "Diary",     icon: BookOpen   },
  { href: "/cv",        label: "CV",        icon: FileText   },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { ready, signOut } = useAuth()
  if (!ready) return null

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">

          {/* Logo + wordmark — navigates to mission page */}
          <Link
            href="/mission"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight hover:opacity-80 transition-opacity"
          >
            <TruthMirrorLogo size="sm" className="text-primary" />
            <span>Truth Mirror</span>
          </Link>

          <div className="flex items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              )
            })}
          </div>

          <button
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>

    </div>
  )
}
