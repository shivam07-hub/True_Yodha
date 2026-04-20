"use client"

import { AppShell } from "@/components/app-shell"
import { MissionContent } from "@/components/mission-content"

export default function MissionPage() {
  return (
    <AppShell>
      <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)", overflowY: "auto", height: "100%" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <MissionContent showCta={false} compact={false} />
        </div>
      </div>
    </AppShell>
  )
}
