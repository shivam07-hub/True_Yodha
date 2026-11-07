"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { MyroLogo } from "@/components/myro-logo"
import { useSession } from "@/lib/hooks/use-auth"
import { stashRecruiterReturn } from "@/lib/internship-post-stash"
import "@/components/public/public-nav.css"

/**
 * The recruiter's own bar. She never gets the seeker strip (Jobs, CV, Prep,
 * Score) — none of it is for her. Signed out, Sign in brings her back here.
 */
export function RecruiterTopBar() {
  const { token } = useSession()
  const router = useRouter()
  return (
    <nav aria-label="Recruiter navigation" className="tm-public-nav">
      <Link href="/recruiters" aria-label="Your internship" className="tm-public-nav-brand">
        <MyroLogo size={34} />
        <span className="tm-public-nav-wordmark">Myro</span>
      </Link>
      {token ? null : (
        <button
          type="button"
          className="tm-public-nav-signin"
          onClick={() => {
            stashRecruiterReturn()
            router.push("/login")
          }}
        >
          Sign in
        </button>
      )}
    </nav>
  )
}
