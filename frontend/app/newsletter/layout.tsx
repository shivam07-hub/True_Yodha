import "./newsletter.css"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"

export default function NewsletterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--tm-bg)" }}>
      <PublicTopNav active="newsletter" showSignIn />
      <main style={{ flex: 1 }}>{children}</main>
      <PublicFooter />
    </div>
  )
}
