"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import type { ReactNode } from "react"
import { jobs } from "@/lib/api"
import { filingHoldLine, filingLine } from "@/lib/jobs/filing"

/**
 * The Yes to file this tailored CV. A yes is stored only when the role is
 * confirmed open, judged at least 3.5, and already tailored. It does not
 * submit the form. Applied waits for a confirmation on the company page.
 */
export function FilingApproval({ token, jobId }: { token: string; jobId: string }) {
  const queryClient = useQueryClient()
  const filing = useQuery({
    queryKey: ["job-filing", jobId],
    queryFn: () => jobs.getFiling(token, jobId),
  })
  const approve = useMutation({
    mutationFn: () => jobs.approveFiling(token, jobId),
    onSuccess: (data) => {
      queryClient.setQueryData(["job-filing", jobId], data)
    },
  })

  const data = filing.data
  if (!data) return null

  let body: ReactNode = null
  if (data.received) {
    body = <p style={noteStyle}>Confirmation saved. This role is applied.</p>
  } else if (data.authorized && data.ready && data.hold_reason) {
    const hold = filingHoldLine(data.hold_reason)
    body = hold ? <p style={noteStyle}>{hold}</p> : null
  } else if (data.authorized && data.ready) {
    body = (
      <p style={noteStyle}>
        Approved for filing. Open the company page and fill it from the extension.
      </p>
    )
  } else if (data.ready) {
    body = (
      <button
        type="button"
        onClick={() => approve.mutate()}
        disabled={approve.isPending}
        style={buttonStyle}
      >
        Approve this CV for filing
      </button>
    )
  } else {
    const line = filingLine(data.blocks[0])
    body = line ? <p style={noteStyle}>{line}</p> : null
  }

  return (
    <div style={stackStyle}>
      {body}
      <p style={noteStyle}>
        <Link href="/filing" style={linkStyle}>
          The ₹599 filing process
        </Link>
      </p>
    </div>
  )
}

const stackStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
} as const

const noteStyle = {
  margin: 0,
  fontSize: "var(--tm-fs-caption)",
  color: "var(--tm-text-muted)",
} as const

const linkStyle = {
  color: "var(--tm-interactive)",
} as const

const buttonStyle = {
  padding: "11px 16px",
  borderRadius: 10,
  border: "1px solid var(--tm-border-soft)",
  background: "transparent",
  color: "var(--tm-text)",
  fontWeight: 600,
  fontSize: "var(--tm-fs-body)",
  cursor: "pointer",
} as const
