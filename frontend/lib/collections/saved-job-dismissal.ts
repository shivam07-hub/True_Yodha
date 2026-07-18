import type { ApplicationResponse } from "@/lib/api"

export interface SavedApplicationSnapshot {
  application: ApplicationResponse
  index: number
}

export interface SavedApplicationRemoval {
  applications: ApplicationResponse[]
  snapshot: SavedApplicationSnapshot
}

export function canDismissSavedApplication(application: ApplicationResponse): boolean {
  return application.status === "saved"
}

export function removeSavedApplication(
  applications: ApplicationResponse[],
  jobId: string,
): SavedApplicationRemoval | null {
  const index = applications.findIndex((application) => application.job_id === jobId)
  if (index < 0 || !canDismissSavedApplication(applications[index])) return null
  return {
    applications: applications.filter((_, candidateIndex) => candidateIndex !== index),
    snapshot: { application: applications[index], index },
  }
}

export function restoreSavedApplication(
  applications: ApplicationResponse[],
  snapshot: SavedApplicationSnapshot,
): ApplicationResponse[] {
  if (applications.some((application) => application.job_id === snapshot.application.job_id)) {
    return applications
  }
  const restored = [...applications]
  restored.splice(Math.min(snapshot.index, restored.length), 0, snapshot.application)
  return restored
}
