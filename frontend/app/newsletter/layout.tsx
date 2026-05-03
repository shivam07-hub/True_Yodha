import type { Metadata } from "next"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"

export const metadata: Metadata = {
  other: {
    "script:ld+json": JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Myro",
      url: "https://www.himyro.com",
      description: "Intelligence-as-a-Service for job seekers",
    }),
  },
}

export default function NewsletterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--tm-bg)" }}>
      <PublicTopNav active="newsletter" showSignIn />
      <main style={{ flex: 1 }}>{children}</main>
      <PublicFooter />
    </div>
  )
}
