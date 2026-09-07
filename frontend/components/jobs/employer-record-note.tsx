"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ghostIndex } from "@/lib/api"
import { employerRecord } from "@/lib/jobs/employer-record"
import "./listing-liveness.css"

/**
 * The employer's track record, on the job.
 *
 * `ListingLiveness` above this says whether THIS listing is still real. This
 * says whether this employer generally leaves dead ones up — the pattern, which
 * is what tells you how much to trust the rest of their board.
 *
 * One shared query for the whole index (18 employers, cached), not a request per
 * job. Renders nothing when the index withheld this employer: silence is the
 * honest rendering of too few observations, and "no data" would be read as
 * reassurance we have not earned.
 */
export function EmployerRecordNote({ company }: { company: string | null | undefined }) {
  const { data } = useQuery({
    queryKey: ["ghost-index", "companies"],
    queryFn: () => ghostIndex.get(),
    staleTime: 60 * 60 * 1000,
    enabled: Boolean(company),
  })

  const record = employerRecord(company, data?.companies)
  if (!record) return null

  return (
    <p className={`jlive jlive--${record.tone}`} role={record.tone === "warn" ? "status" : undefined}>
      {record.text}{" "}
      <Link className="tm-link" href="/ghost-index">How we know</Link>
    </p>
  )
}
