"use client"

import { AppShell } from "@/components/app-shell"
import { MissionContent } from "@/components/mission-content"

export default function MissionPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl py-4">
        <MissionContent showCta={false} compact={false} />
      </div>
    </AppShell>
  )
}
