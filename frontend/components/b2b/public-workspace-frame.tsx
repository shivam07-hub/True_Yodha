import type { ReactNode } from "react"
import { PublicFooter } from "@/components/public/public-footer"
import { PublicTopNav } from "@/components/public/top-nav"

export function PublicWorkspaceFrame({ children }: { children: ReactNode }) {
  return (
    <div className="b2bws-preview">
      <PublicTopNav showSignIn />
      <main className="b2bws-preview-main">{children}</main>
      <PublicFooter />
    </div>
  )
}
