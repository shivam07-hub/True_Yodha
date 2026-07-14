/**
 * PlaygroundBottomNav — mobile segmented nav (Edit / Fixes / Skills / Preview),
 * fixed above the app's bottom nav. Hidden on desktop (playground-v2.css).
 */
"use client"

type V2Tab = "edit" | "fixes" | "skills" | "preview"

interface PlaygroundBottomNavProps {
  tab: V2Tab
  fixCountLabel: string
  onTab: (tab: V2Tab) => void
}

export function PlaygroundBottomNav({ tab, fixCountLabel, onTab }: PlaygroundBottomNavProps) {
  return (
    <nav className="cvb-v2-bottomnav" aria-label="Playground sections">
      {(["edit", "fixes", "skills", "preview"] as const).map(t => (
        <button
          key={t}
          type="button"
          className={`cvb-v2-tabbtn${tab === t ? " active" : ""}`}
          onClick={() => onTab(t)}
        >
          {t === "edit" ? "Edit"
            : t === "fixes" ? `Fixes · ${fixCountLabel}`
            : t === "skills" ? "Job fit" : "Preview"}
        </button>
      ))}
    </nav>
  )
}
