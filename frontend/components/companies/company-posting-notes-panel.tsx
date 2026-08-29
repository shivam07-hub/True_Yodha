"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { publicRead } from "@/lib/public-api"

export interface PostingNote {
  job_id: string
  role: string | null
  body: string
  author_ninja_name: string | null
  created_at: string
}

async function fetchPostingNotes(name: string): Promise<PostingNote[]> {
  const data = await publicRead<{ posting_notes?: PostingNote[] }>(
    `/companies/${encodeURIComponent(name)}`,
    { missing: "empty" },
  )
  return data?.posting_notes ?? []
}

export function CompanyPostingNotesPanel({ companyName }: { companyName: string }) {
  const [showPostingNotes, setShowPostingNotes] = useState(false)
  const {
    data: postingNotes,
    isFetching: isFetchingPostingNotes,
    isError: isPostingNotesError,
    refetch: refetchPostingNotes,
  } = useQuery({
    queryKey: ["company-posting-notes", companyName],
    queryFn: () => fetchPostingNotes(companyName),
    enabled: showPostingNotes,
    staleTime: 5 * 60 * 1000,
  })

  if (!showPostingNotes) {
    return (
      <div style={{ marginTop: 24 }}>
        <Button type="button" variant="neutral" size="sm" onClick={() => setShowPostingNotes(true)}>
          Show notes from individual roles
        </Button>
      </div>
    )
  }

  if (isFetchingPostingNotes) {
    return (
      <div role="status" style={{ marginTop: 24, color: "var(--tm-text-faint)", fontSize: 13 }}>
        Loading role notes…
      </div>
    )
  }

  if (postingNotes && postingNotes.length > 0) {
    return (
      <div style={{ marginTop: 24, padding: "24px 28px", background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 14 }}>
        <div className="tm-label-caps" style={{ color: "var(--tm-text-faint)", marginBottom: 12 }}>
          From applicants on open roles
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {postingNotes.map((n, i) => (
            <li key={`${n.job_id}-${i}`} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.02)" }}>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--tm-text)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{n.body}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7, fontSize: 11, color: "var(--tm-text-faint)" }}>
                {n.role && <span style={{ fontWeight: 600, color: "var(--tm-text-soft, var(--tm-text-faint))" }}>{n.role}</span>}
                {n.author_ninja_name ? (
                  <Link href={`/profile/${n.author_ninja_name}`} style={{ color: "var(--tm-interactive-rest)", fontWeight: 700, textDecoration: "none" }}>{n.author_ninja_name}</Link>
                ) : (
                  <span>A Myro user</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (isPostingNotesError) {
    return (
      <div role="alert" style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 12, color: "var(--tm-text-faint)", fontSize: 13 }}>
        <span>Role notes could not be loaded.</span>
        <Button type="button" variant="solid" size="sm" onClick={() => void refetchPostingNotes()}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 24, color: "var(--tm-text-faint)", fontSize: 13 }}>
      No notes have been shared on individual roles yet.
    </div>
  )
}
