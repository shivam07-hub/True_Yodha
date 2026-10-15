"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { type ReactNode, useRef } from "react"
import { jobs, type JobFilingNote } from "@/lib/api"
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
    body = (
      <>
        <p style={noteStyle}>Confirmation saved. This role is applied.</p>
        <FilingNotes token={token} jobId={jobId} />
      </>
    )
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

/**
 * The two notes after the application is confirmed (ADR-0026 step 8): someone
 * the person has written to, and the connection whose seat is the role's
 * motion. Both from the person's own export. The person sends; Myro never does.
 */
function FilingNotes({ token, jobId }: { token: string; jobId: string }) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const notes = useQuery({
    queryKey: ["filing-notes", jobId],
    queryFn: () => jobs.getFilingNotes(token, jobId),
  })
  const upload = useMutation({
    mutationFn: (file: File) => jobs.uploadConnections(token, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["filing-notes", jobId] }),
  })

  const n = notes.data
  if (!n || !n.applied) return null

  if (!n.has_export) {
    return (
      <div style={notesStyle}>
        <p style={noteStyle}>Two notes close the loop. Upload your own LinkedIn connections to find who to ask.</p>
        <button
          type="button"
          style={buttonStyle}
          disabled={upload.isPending}
          onClick={() => fileRef.current?.click()}
        >
          {upload.isPending ? "Reading your export" : "Upload connections"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.zip"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload.mutate(file)
          }}
        />
        {upload.isError ? <p style={noteStyle}>Couldn’t read that file — use your Connections.csv.</p> : null}
      </div>
    )
  }

  if (n.written_to.length === 0) {
    return <p style={noteStyle}>No connections at {n.company || "this company"} in your export.</p>
  }

  return (
    <div style={notesStyle}>
      <p style={noteStyle}>Two notes, then stop. The same CV goes with both, and you send them.</p>
      <div style={notesStyle}>
        <p style={labelStyle}>Someone you’ve written to — pick the one</p>
        <ul style={listStyle}>
          {n.written_to.map((person) => (
            <li key={`${person.full_name}·${person.position}`} style={noteStyle}>
              {personLine(person)}
            </li>
          ))}
        </ul>
      </div>
      <div style={notesStyle}>
        <p style={labelStyle}>The seat that matches the role</p>
        {n.motion_match ? (
          <p style={noteStyle}>{personLine(n.motion_match)}</p>
        ) : (
          <p style={noteStyle}>No title in your export matches this role’s seat.</p>
        )}
      </div>
    </div>
  )
}

function personLine(person: JobFilingNote): string {
  return person.position ? `${person.full_name} · ${person.position}` : person.full_name
}

const stackStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
} as const

const notesStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
} as const

const labelStyle = {
  margin: 0,
  fontSize: "var(--tm-fs-caption)",
  fontWeight: 600,
  color: "var(--tm-text)",
} as const

const listStyle = {
  margin: 0,
  paddingLeft: 18,
  display: "flex",
  flexDirection: "column",
  gap: 4,
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
