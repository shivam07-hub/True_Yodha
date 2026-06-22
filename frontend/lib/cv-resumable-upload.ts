// Resumable, direct-to-storage CV transfer (BUG-2 real fix — the Google Drive model).
//
// The legacy path streams the whole CV through our FastAPI app server as one
// multipart POST. On lossy mobile links that single fragile hop to api.himyro.com
// fails fast (613ms median) and often (65% of attempts) — 5 users were hard-blocked.
// Here the browser uploads the file straight to a private Supabase Storage bucket via
// Supabase's native resumable (TUS) endpoint: a different host than our API, a battle-
// tested client that auto-retries on a fresh connection, and resume-from-offset across
// page reloads. The backend then ingests it (POST /cv/upload/finalize).
//
// Everything degrades soft: no Supabase env / no JWT sub / TUS transport error → the
// caller falls back to the existing multipart POST. Ownership is enforced server-side
// (finalize checks the path prefix) and by storage RLS (own {user_id}/ folder only) —
// the jwtSub decode here is only to BUILD the path, never a security boundary.

import * as tus from "tus-js-client"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const CV_UPLOAD_BUCKET = "cv-uploads"

export function resumableUploadSupported(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && typeof window !== "undefined")
}

/** auth.uid() == the JWT `sub`; the storage RLS path must start with it. Unverified
 *  read only — finalize + RLS enforce ownership, not this. */
export function jwtSub(token: string): string | null {
  try {
    const part = token.split(".")[1]
    if (!part) return null
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")))
    return typeof json.sub === "string" ? json.sub : null
  } catch {
    return null
  }
}

/** Upload the picked CV straight to private storage. Resolves once the bytes land;
 *  rejects on a terminal transport error (caller then falls back to multipart). */
export function uploadCVToStorage(opts: {
  token: string
  file: File
  objectPath: string
  onProgress?: (pct: number) => void
}): Promise<void> {
  const { token, file, objectPath, onProgress } = opts
  if (!resumableUploadSupported()) {
    return Promise.reject(new Error("resumable upload unsupported"))
  }
  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      // Auto-retry on a fresh connection — the lever for flaky radios.
      retryDelays: [0, 1000, 3000, 6000, 10000],
      headers: {
        authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY as string,
        "x-upsert": "true",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // Supabase's resumable endpoint requires a 6MB chunk size. CVs are <<6MB so this
      // is a single (final) chunk; the resilience comes from retry + cross-reload resume.
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: CV_UPLOAD_BUCKET,
        objectName: objectPath,
        contentType: file.type,
        cacheControl: "3600",
      },
      onError: (err) => reject(err),
      onProgress: (sent, total) => {
        if (onProgress && total) onProgress(Math.round((sent / total) * 100))
      },
      onSuccess: () => resolve(),
    })
    // Resume a prior interrupted upload of the SAME file before starting fresh.
    upload
      .findPreviousUploads()
      .then((prev) => {
        if (prev.length) upload.resumeFromPreviousUpload(prev[0])
        upload.start()
      })
      .catch(() => upload.start())
  })
}
