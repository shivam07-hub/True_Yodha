import type { Metadata } from "next"
import { PublicFooter } from "@/components/public/public-footer"
import { PublicTopNav } from "@/components/public/top-nav"
import { InternshipPostForm } from "@/components/internships/post-form"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Post a paid internship — Myro",
  description: "Host a paid internship on Myro. Students apply here, not on a third-party board.",
  alternates: { canonical: `${BASE}/internships/post` },
  robots: { index: true, follow: true },
}

export default function InternshipPostPage() {
  return (
    <div className="tm-page-canvas" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <PublicTopNav showSignIn />
      <div style={{ flex: 1 }}>
        <InternshipPostForm />
        <PublicFooter commons />
      </div>
    </div>
  )
}
