import { announceCVUploadJob } from "./cv-upload-events"

const CV_UPLOAD_JOB_KEY = "myro_cv_upload_job_v1"
const CV_UPLOAD_IDEM_KEY = "myro_cv_upload_idem_v1"

export function createCVUploadIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function persistCVUploadJob(jobId: string): void {
  try { localStorage.setItem(CV_UPLOAD_JOB_KEY, jobId) } catch { /* private mode */ }
  announceCVUploadJob(jobId)
}

export function readCVUploadJob(): string | null {
  try { return localStorage.getItem(CV_UPLOAD_JOB_KEY) } catch { return null }
}

export function readCVUploadIdempotencyKey(): string | null {
  try { return localStorage.getItem(CV_UPLOAD_IDEM_KEY) } catch { return null }
}

export function persistCVUploadIdempotencyKey(key: string): void {
  try { localStorage.setItem(CV_UPLOAD_IDEM_KEY, key) } catch { /* private mode */ }
}

export function clearCVUploadPersistence(clearIdempotencyKey: boolean): void {
  try {
    localStorage.removeItem(CV_UPLOAD_JOB_KEY)
    if (clearIdempotencyKey) localStorage.removeItem(CV_UPLOAD_IDEM_KEY)
  } catch {
    /* private mode */
  }
}
