/** Her own internships — the recruiter door reads it, a new post refreshes it. */
export const MY_INTERNSHIPS_KEY = ["internships-mine"] as const

export const applicantsKey = (jobId: string) => ["internship-applicants", jobId] as const
export const applicantKey = (jobId: string, applicationId: number) =>
  ["internship-applicant", jobId, applicationId] as const
