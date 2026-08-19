import { ApiError } from "@/lib/api-error"

/** What the proposals screen shows when apply fails. The 409 is a real reason. */
export function applyErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message) return err.message
  if (err instanceof Error && err.message) return err.message
  return "Couldn't save those. Nothing was applied — try again."
}
