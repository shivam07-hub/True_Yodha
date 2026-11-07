"use client"

import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import { useSession } from "@/lib/hooks/use-auth"
import { clearRecruiterReturn } from "@/lib/internship-post-stash"
import { InternshipPostForm } from "./post-form"
import { RecruiterHome } from "./recruiter-home"
import { MY_INTERNSHIPS_KEY } from "./keys"
import "./internships.css"

/** One door: no post yet → the post form; posted → her internship and who applied. */
export function RecruiterDoor() {
  const { token, ready } = useSession()
  const mine = useQuery({
    queryKey: MY_INTERNSHIPS_KEY,
    queryFn: () => jobs.myInternships(token as string),
    enabled: Boolean(token),
    staleTime: 30_000,
  })
  useEffect(() => {
    if (token) clearRecruiterReturn()
  }, [token])

  if (!ready || (token && mine.isLoading)) {
    return <main className="intern-page" aria-busy="true" />
  }
  // Never fall back to the form when her posts did not load: she would post twice.
  if (token && mine.isError) {
    return (
      <main className="intern-page">
        <p className="intern-error">Could not load your internship</p>
        <button type="button" className="intern-secondary" onClick={() => void mine.refetch()}>
          Try again
        </button>
      </main>
    )
  }
  if (token && mine.data && mine.data.jobs.length > 0) {
    return <RecruiterHome token={token} posts={mine.data.jobs} />
  }
  return <InternshipPostForm />
}
