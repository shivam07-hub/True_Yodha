import type { EmployerStatus } from "@/lib/api"

/** The company's answer on an internship hosted on Myro — one set of words,
 *  read the same by the recruiter who wrote it and the seeker it is about. */
export const EMPLOYER_STATUS_WORD: Record<EmployerStatus, string> = {
  seen: "Seen",
  shortlisted: "Shortlisted",
  passed: "Passed",
}
