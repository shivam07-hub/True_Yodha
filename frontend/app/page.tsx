import { MissionContent } from "@/components/mission-content"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-4 py-12">
        <MissionContent showCta compact={false} />
      </main>
    </div>
  )
}
