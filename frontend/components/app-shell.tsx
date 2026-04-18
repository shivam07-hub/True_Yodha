"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { BarChart3, BookOpen, Briefcase, FileText, Globe, LogOut } from "lucide-react"
import { useAuth } from "@/lib/hooks/use-auth"
import { scores } from "@/lib/api"
import { TruthMirrorLogo } from "@/components/truth-mirror-logo"

const NAV_ITEMS = [
  { href: "/cv",        label: "CV",        icon: FileText   },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/tracker",   label: "Jobs",      icon: Briefcase  },
  { href: "/market",    label: "Intel",     icon: Globe      },
  { href: "/diary",     label: "Diary",     icon: BookOpen   },
]

function scoreColor(s: number) {
  if (s >= 70) return "text-green-500"
  if (s >= 40) return "text-amber-500"
  return "text-red-500"
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { token, ready, signOut } = useAuth()

  const { data: scoreData } = useQuery({
    queryKey: ["scores", token],
    queryFn: () => scores.me(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  if (!ready) return null

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">

          {/* Logo + wordmark + Truth Score */}
          <Link
            href="/mission"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight hover:opacity-80 transition-opacity"
          >
            <TruthMirrorLogo size="sm" className="text-primary" />
            <span>Truth Mirror</span>
          </Link>
          {scoreData && (
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Truth Score</span>
              <span className={`text-sm font-bold tabular-nums ${scoreColor(scoreData.total_score)}`}>
                {Math.round(scoreData.total_score)}
              </span>
              <span className="text-muted-foreground/50">/100</span>
            </Link>
          )}

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
