/**
 * Dump triage — pure classification for folder-scale reservoir dumps.
 *
 * A dropped folder can hold hundreds of files (an unzipped LinkedIn export is
 * ~47 CSVs, ~40 of them account telemetry). Triage decides client-side what is
 * worth uploading so one folder drop stays one honest action: signal goes up,
 * junk is named in the receipt, duplicates are skipped. Mirrors the server's
 * intake rules (reservoir_intake.py) — the server re-checks everything.
 */

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".csv", ".zip"]

export const MAX_FILE_BYTES = 8 * 1024 * 1024
export const BATCH_SIZE = 15

/** LinkedIn telemetry CSV basenames (normalized: lower, _ → space, numeric
 * suffix dropped). Mirror of reservoir_intake._LINKEDIN_NOISE. */
const LINKEDIN_NOISE = new Set([
  "ad targeting", "ads clicked", "comments", "company follows", "courses",
  "email addresses", "endorsement given info", "endorsement received info",
  "events", "hashtag follows", "importedcontacts", "imported contacts",
  "inferences about you", "instantreposts", "invitations",
  "job applicant saved screening question responses", "lan ads engagement",
  "learning", "learningcoachmessages", "learning coach messages",
  "learning role play messages", "logins", "member follows", "messages",
  "phonenumbers", "phone numbers", "private identity asset", "reactions",
  "receipts v2", "registration", "rich media", "savedjobalerts",
  "saved items", "searchqueries", "search queries", "security challenges",
  "testscores", "test scores", "votes", "whatsapp phone numbers",
  "guide messages",
])

export type TriageReason =
  | "unsupported"      // extension we can't read (.pages, .pptx, .DS_Store…)
  | "telemetry"        // LinkedIn account noise (logins, ads, reactions…)
  | "too_large"        // over the per-file byte cap
  | "duplicate"        // same name+size already picked

export interface TriagedFiles {
  send: File[]
  skipped: { name: string; reason: TriageReason }[]
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot >= 0 ? name.slice(dot).toLowerCase() : ""
}

function normalizedStem(name: string): string {
  const base = name.split("/").pop() ?? name
  const stem = base.replace(/\.[^.]+$/, "").toLowerCase().replace(/_/g, " ")
  return stem
    .split(/\s+/)
    .filter((part) => !/^\d+$/.test(part)) // Comments_622594202 → comments
    .join(" ")
}

export function isLinkedinNoise(name: string): boolean {
  return extension(name) === ".csv" && LINKEDIN_NOISE.has(normalizedStem(name))
}

export function isRecommendationsGiven(name: string): boolean {
  return (name.split("/").pop() ?? name).toLowerCase().replace(/\s/g, "_").includes("recommendations_given")
}

/** Classify a flat list of files (from a folder walk or multi-pick) into what
 * to upload vs what to skip, with a named reason per skip. Pure. */
export function triageFiles(files: File[]): TriagedFiles {
  const send: File[] = []
  const skipped: TriagedFiles["skipped"] = []
  const seen = new Set<string>()

  for (const f of files) {
    const name = f.name
    if (name.startsWith(".")) continue // .DS_Store etc — not worth a receipt line
    if (!SUPPORTED_EXTENSIONS.includes(extension(name))) {
      skipped.push({ name, reason: "unsupported" })
      continue
    }
    if (isLinkedinNoise(name) || isRecommendationsGiven(name)) {
      skipped.push({ name, reason: "telemetry" })
      continue
    }
    if (f.size > MAX_FILE_BYTES) {
      skipped.push({ name, reason: "too_large" })
      continue
    }
    const key = `${name.toLowerCase()}:${f.size}`
    if (seen.has(key)) {
      skipped.push({ name, reason: "duplicate" })
      continue
    }
    seen.add(key)
    send.push(f)
  }
  return { send, skipped }
}

/** Split the send-list into sequential upload batches (server caps files/request). */
export function batches<T>(items: T[], size: number = BATCH_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** One human line per skip reason for the receipt. */
export function skipSummary(skipped: TriagedFiles["skipped"]): string[] {
  const labels: Record<TriageReason, string> = {
    telemetry: "LinkedIn telemetry",
    unsupported: "unsupported format",
    too_large: "over 8MB",
    duplicate: "duplicate",
  }
  const counts = new Map<TriageReason, number>()
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1)
  return Array.from(counts.entries()).map(([reason, n]) => `${n} ${labels[reason]}`)
}

/** Recursively walk a DataTransfer (folder drop) into a flat File list.
 * Falls back to plain files when the browser lacks webkitGetAsEntry. */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const entries: FileSystemEntry[] = []
  for (const item of Array.from(dt.items)) {
    const entry = item.webkitGetAsEntry?.()
    if (entry) entries.push(entry)
  }
  if (entries.length === 0) return Array.from(dt.files)

  const out: File[] = []
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) =>
        (entry as FileSystemFileEntry).file(resolve, () => resolve(null)),
      )
      if (file) out.push(file)
      return
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      // readEntries returns results in chunks — drain until empty.
      let batch: FileSystemEntry[]
      do {
        batch = await new Promise<FileSystemEntry[]>((resolve) =>
          reader.readEntries(resolve, () => resolve([])),
        )
        for (const child of batch) await walk(child)
      } while (batch.length > 0)
    }
  }
  for (const entry of entries) await walk(entry)
  return out
}
