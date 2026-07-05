import {
  clearAnonCvStash,
  hasStashedFile,
  readStashedComposedCvText,
  stashAnonCvFile,
  takeStashedFile,
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
}

const defaultDeps: AnonCvClaimDeps = {
  readComposedText: readStashedComposedCvText,
  hasFile: hasStashedFile,
  takeFile: takeStashedFile,
  stashFile: stashAnonCvFile,
  clearStash: clearAnonCvStash,
  uploadText: (token, text, source) => uploadCVText(token, text, source),
  uploadFile: (token, file, source) => uploadCV(token, file, source),
}

export function hasPendingAnonCvClaim(deps: AnonCvClaimDeps = defaultDeps): boolean {
  return !!deps.readComposedText()?.trim() || deps.hasFile()
}

export async function claimPendingAnonCv(
  token: string,
  deps: AnonCvClaimDeps = defaultDeps,
): Promise<AnonCvClaimResult> {
  const text = deps.readComposedText()?.trim()
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
