import { ParticleBg } from "@/components/particle-bg"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { IntelPane } from "@/components/public/intel-pane"

export default function HomePage() {
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--tm-bg)", position: "relative", overflow: "hidden" }}>
      <ParticleBg />
      <PublicTopNav active="intel" showSignIn />
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 2 }}>
        <IntelPane />
      </div>
      <PublicFooter />
    </div>
  )
}
