import type {
  CVUploadPolledStatus as CVUploadStatusResponse,
  CVUploadResultShape as CVUploadResult,
} from "./cv-upload-state"

export const CV_UPLOAD_JOB_EVENT = "myro:cv-upload-job"
export const CV_UPLOAD_PROGRESS_EVENT = "myro:cv-upload-progress"
export const CV_UPLOAD_TERMINAL_EVENT = "myro:cv-upload-terminal"

export interface CVUploadJobEventDetail {
  jobId: string
}

export interface CVUploadProgressEventDetail extends CVUploadJobEventDetail {
  status: CVUploadStatusResponse
}

export type CVUploadTerminalEventDetail =
  | (CVUploadJobEventDetail & { outcome: "done"; result: CVUploadResult })
  | (CVUploadJobEventDetail & { outcome: "failed"; error: Error })

function emit<T>(name: string, detail: T): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<T>(name, { detail }))
}

export function announceCVUploadJob(jobId: string): void {
  emit<CVUploadJobEventDetail>(CV_UPLOAD_JOB_EVENT, { jobId })
}

export function announceCVUploadProgress(jobId: string, status: CVUploadStatusResponse): void {
  emit<CVUploadProgressEventDetail>(CV_UPLOAD_PROGRESS_EVENT, { jobId, status })
}

export function announceCVUploadTerminal(detail: CVUploadTerminalEventDetail): void {
  emit<CVUploadTerminalEventDetail>(CV_UPLOAD_TERMINAL_EVENT, detail)
}
