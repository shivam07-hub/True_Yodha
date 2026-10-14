/** The first extension job that was not already saved when the door opened. */
export function newExtensionJob(
  known: ReadonlySet<string>,
  rows: ReadonlyArray<{ job_id?: string | null }>,
): string | null {
  for (const row of rows) {
    const id = row.job_id ?? ""
    if (id.startsWith("ext_") && !known.has(id)) return id
  }
  return null
}
