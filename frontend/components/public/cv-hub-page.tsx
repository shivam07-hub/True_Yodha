import { AboutHero } from "@/components/public/about-hero"
import { AboutSteps } from "@/components/public/about-steps"
import { PublicFooter } from "@/components/public/public-footer"
import { PublicTopNav } from "@/components/public/top-nav"
import { SampleDiagnostic } from "@/components/public/sample-diagnostic"

interface CVHubPageProps {
  showSignIn?: boolean
}

export function CVHubPage({ showSignIn = true }: CVHubPageProps) {
  return (
    <div
      style={{
        height: "100dvh",
        width: "100vw",
        maxWidth: "100vw",
        display: "flex",
        flexDirection: "column",
        background: "var(--tm-bg)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <PublicTopNav active="about" showSignIn={showSignIn} />
      <div
        style={{
          flex: 1,
          width: "100%",
          minWidth: 0,
          overflowY: "auto",
          overflowX: "hidden",
          position: "relative",
          zIndex: 2,
        }}
      >
        <AboutHero />
        <AboutSteps />
        <div id="sample-diagnostic" style={{ scrollMarginTop: 72 }}>
          <SampleDiagnostic />
        </div>
        <PublicFooter />
      </div>
    </div>
  )
}
