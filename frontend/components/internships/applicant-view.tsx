"use client"

import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs, type CVStructured } from "@/lib/api"
import { ApiError } from "@/lib/api-error"
import { useAuth } from "@/lib/hooks/use-auth"
import { formatDate } from "@/lib/format"
import { PdfPage } from "@/components/cv/builder/pdf-page"
import { EMPLOYER_STATUS_WORD } from "@/lib/jobs/employer-status"
import { MY_INTERNSHIPS_KEY, applicantKey, applicantsKey } from "./keys"
import "@/app/(authed)/cv/cv-sheet.css"
import "@/app/(authed)/cv/cv-builder.css"
import "./internships.css"

function hasStructure(cv: CVStructured | undefined): cv is CVStructured {
  return Boolean(cv && Array.isArray(cv.experience))
}

/** One applicant, as she reads him: the CV he sent, his Myro Score, his skills. */
export function ApplicantView({ jobId, applicationId }: { jobId: string; applicationId: number }) {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const key = applicantKey(jobId, applicationId)
  const applicant = useQuery({
    queryKey: key,
    queryFn: () => jobs.internshipApplicant(token as string, jobId, applicationId),
    enabled: Boolean(token),
  })
  const decide = useMutation({
    mutationFn: (status: "shortlisted" | "passed") =>
      jobs.decideApplicant(token as string, jobId, applicationId, status),
    onSuccess: (view) => {
      queryClient.setQueryData(key, view)
      void queryClient.invalidateQueries({ queryKey: applicantsKey(jobId) })
      void queryClient.invalidateQueries({ queryKey: MY_INTERNSHIPS_KEY })
    },
  })

  const a = applicant.data
  if (applicant.isError) {
    return (
      <main className="intern-page">
        <p className="intern-error">
          {applicant.error instanceof ApiError ? applicant.error.message : "Could not open this applicant"}
        </p>
        <Link href="/recruiters">Your internship</Link>
      </main>
    )
  }
  if (!a) return <main className="intern-page" aria-busy="true" />

  const structured = a.cv?.structured
  return (
    <main className="intern-page">
      <p className="intern-kicker">
        <Link href="/recruiters">Your internship</Link>
        {a.employer_status ? ` · ${EMPLOYER_STATUS_WORD[a.employer_status]}` : ""}
      </p>
      <h1 className="intern-title">{a.name}</h1>
      <p className="intern-lead">
        Applied {formatDate(a.applied_at, "medium")}
        {a.score !== null ? ` · Myro Score ${Math.round(a.score)}` : ""}
      </p>
      {a.skills.length > 0 ? (
        <ul className="intern-skills" aria-label="Skills">
          {a.skills.map((s) => <li key={s}>{s}</li>)}
        </ul>
      ) : null}
      <div className="intern-actions">
        <button
          type="button"
          className="intern-submit"
          disabled={decide.isPending || a.employer_status === "shortlisted"}
          onClick={() => decide.mutate("shortlisted")}
        >
          Shortlist
        </button>
        <button
          type="button"
          className="intern-secondary"
          disabled={decide.isPending || a.employer_status === "passed"}
          onClick={() => decide.mutate("passed")}
        >
          Pass
        </button>
      </div>
      {hasStructure(structured) ? (
        <div className="cvb-scope intern-cv">
          <PdfPage
            cv={structured}
            hidden={new Set(a.cv?.hidden ?? [])}
            contact={{
              name: structured.contact?.name?.trim() || a.name,
              title: structured.contact?.title?.trim() || "",
              location: structured.contact?.location?.trim() || "",
              email: structured.contact?.email?.trim() || "",
              phone: structured.contact?.phone?.trim() || "",
              linkedin: structured.contact?.linkedin?.trim() || "",
            }}
          />
        </div>
      ) : a.cv?.text ? (
        <pre className="intern-cv-text">{a.cv.text}</pre>
      ) : (
        <p className="intern-empty">No CV was on Myro when this person applied</p>
      )}
    </main>
  )
}
