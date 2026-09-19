import {
  clearAnonCvStash,
  hasStashedFile,
  readOriginalComposedCvText,
  readStashedComposedCvText,
  readStashedOrigin,
  stashAnonCvFile,
  takeStashedFile,
  type AnonCvOrigin,
} from "@/lib/anon-cv-stash"
import {
  type CVUploadResult,
  type CVUploadSource,
  uploadCV,
  uploadCVText,
} from "@/lib/api"

export type AnonCvClaimResult =
  | { claimed: false }
  | { claimed: true; source: "text" | "file"; result: CVUploadResult }

export interface AnonCvClaimDeps {
  readComposedText: () => string | null
  hasFile: () => boolean
  takeFile: () => File | null
  stashFile: (file: File) => void
  clearStash: () => void
  uploadText: (token: string, text: string, source: CVUploadSource) => Promise<CVUploadResult>
  uploadFile: (token: string, file: File, source: CVUploadSource) => Promise<CVUploadResult>
  readOrigin?: () => AnonCvOrigin | null
  readOriginalComposed?: () => string | null
}

const defaultDeps: AnonCvClaimDeps = {
  readComposedText: readStashedComposedCvText,
  hasFile: hasStashedFile,
  takeFile: takeStashedFile,
  stashFile: stashAnonCvFile,
  clearStash: clearAnonCvStash,
  uploadText: (token, text, source) => uploadCVText(token, text, source),
  uploadFile: (token, file, source) => uploadCV(token, file, source),
  readOrigin: readStashedOrigin,
  readOriginalComposed: readOriginalComposedCvText,
}

export function hasPendingAnonCvClaim(deps: AnonCvClaimDeps = defaultDeps): boolean {
  return !!deps.readComposedText()?.trim() || deps.hasFile()
}

export async function claimPendingAnonCv(
  token: string,
  deps: AnonCvClaimDeps = defaultDeps,
): Promise<AnonCvClaimResult> {
  const origin = deps.readOrigin?.() ?? null
  const text = deps.readComposedText()?.trim() || ""
  const original = deps.readOriginalComposed?.()?.trim() || ""
  const edited = Boolean(text && original && text !== original)
  const fromFile = origin === "file"

  if (fromFile) {
    if (deps.hasFile() && !edited) {
      const file = deps.takeFile()
      if (file) {
        try {
          const result = await deps.uploadFile(token, file, "pdf_upload")
          deps.clearStash()
          return { claimed: true, source: "file", result }
        } catch (err) {
          deps.stashFile(file)
          throw err
        }
      }
    }
    if (text) {
      const result = await deps.uploadText(token, text, "pdf_upload")
      deps.clearStash()
      return { claimed: true, source: "text", result }
    }
    return { claimed: false }
  }

  if (text) {
    const result = await deps.uploadText(token, text, "text_describe")
    deps.clearStash()
    return { claimed: true, source: "text", result }
  }

  const file = deps.takeFile()
  if (!file) return { claimed: false }

  try {
    const result = await deps.uploadFile(token, file, "pdf_upload")
    deps.clearStash()
    return { claimed: true, source: "file", result }
  } catch (err) {
    deps.stashFile(file)
    throw err
  }
}
