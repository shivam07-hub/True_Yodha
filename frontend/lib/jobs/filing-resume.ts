import { jobs } from "@/lib/api"

/** Keep the downloaded sheet PDF on the filing row. A refusal leaves the
 *  download in place; the walk then asks the person to attach it. */
export async function rememberFilingResume(
  token: string,
  jobId: string,
  blob: Blob,
  filename: string,
): Promise<boolean> {
  try {
    const pdf_base64 = await blobBase64(blob)
    if (!pdf_base64 || pdf_base64.length > 2_000_000) return false
    await jobs.saveFilingResume(token, jobId, { filename, pdf_base64 })
    return true
  } catch {
    return false
  }
}

function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || "")
      const comma = text.indexOf(",")
      resolve(comma >= 0 ? text.slice(comma + 1) : "")
    }
    reader.onerror = () => reject(reader.error ?? new Error("The CV file could not be read."))
    reader.readAsDataURL(blob)
  })
}
