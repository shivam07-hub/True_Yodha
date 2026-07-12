// Durable pending-CV-upload store (the "once you pick it, we've got it" guarantee).
//
// The dominant prod CV-upload failure is `upload_post_interrupted`: the phone's
// mobile radio drops the multipart POST mid-flight on weak 3G/4G. Measured files
// are tiny (96% < 200KB; PDFs already compressed, DOCX ~8KB) so reducing bytes
// does nothing — the radio, not the payload, is the failure. The Google Drive /
// Gmail answer is resilience, not compression: hold the file the instant it's
// picked, upload in the background, and resume the moment connectivity returns.
//
// Phase-1 POST never lands on a dead radio → no server job_id exists → the
// CVUP2 job_id resume (localStorage) has nothing to resume. So we persist the
// File itself in IndexedDB (localStorage is string-only; IndexedDB stores Blobs
// natively) alongside the SAME Idempotency-Key. Replaying the POST with that key
// is safe per CVUP1 — the backend dedups and never double-charges. The stash is
// written before the POST and cleared the instant the bytes land (job_id
// obtained), after which CVUP2 owns the lifecycle.
//
// Everything fails soft: no IndexedDB (private mode, old browser) → the queue is
// a no-op and the upload degrades to the existing in-session retry path.

import type { CVUploadSource } from "./api"

const DB_NAME = "myro_cv_upload_v1"
const STORE = "pending"
const PENDING_KEY = "current"
// A picked-but-unsent CV older than this is stale — don't resurrect a file the
// user abandoned days ago. Generous enough to cover "gave up, came back later".
const PENDING_TTL_MS = 24 * 60 * 60 * 1000

export interface PendingCVUpload {
  file: File
  source: CVUploadSource
  idempotencyKey: string
  createdAt: number
  /** JWT `sub` of the account that picked the file. The stash is browser-scoped
   *  storage, so without this a same-browser account switch would replay one
   *  user's picked CV into another user's account (incident 2026-07-11:
   *  shivam.mit20 received a foreign baseline). Resume requires a match. */
  ownerSub: string | null
}

function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined"
}

function openDB(): Promise<IDBDatabase | null> {
  if (!idbAvailable()) return Promise.resolve(null)
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, 1)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    let request: IDBRequest<T>
    try {
      const t = db.transaction(STORE, mode)
      request = run(t.objectStore(STORE))
    } catch {
      resolve(null)
      return
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

/** Persist the picked file + its idempotency key before the network POST. */
export async function stashPendingCVUpload(entry: Omit<PendingCVUpload, "createdAt">): Promise<void> {
  const db = await openDB()
  if (!db) return
  const value: PendingCVUpload = { ...entry, createdAt: Date.now() }
  await tx(db, "readwrite", (s) => s.put(value, PENDING_KEY))
  db.close()
}

/** Read the pending upload for THIS account, pruning stale or foreign-owner
 *  entries. `expectedSub` is the current session's JWT sub: an entry stashed by
 *  a different account (or a pre-fix entry with no owner recorded) is deleted,
 *  never replayed — the wrong-account replay is worse than asking the original
 *  user to re-pick their file. Returns null when none/expired/foreign. */
export async function readPendingCVUpload(expectedSub: string | null): Promise<PendingCVUpload | null> {
  const db = await openDB()
  if (!db) return null
  const value = (await tx<PendingCVUpload>(db, "readonly", (s) => s.get(PENDING_KEY) as IDBRequest<PendingCVUpload>)) ?? null
  const expired = value != null && Date.now() - value.createdAt > PENDING_TTL_MS
  const foreign = value != null && (!value.ownerSub || !expectedSub || value.ownerSub !== expectedSub)
  if (expired || foreign) {
    await tx(db, "readwrite", (s) => s.delete(PENDING_KEY))
    db.close()
    return null
  }
  db.close()
  // A persisted entry whose blob failed to round-trip (no File) is unusable.
  if (value && !(value.file instanceof File)) return null
  return value
}

/** Cheap existence probe for resume effects that only need a yes/no. */
export async function hasPendingCVUpload(expectedSub: string | null): Promise<boolean> {
  return (await readPendingCVUpload(expectedSub)) != null
}

/** Bytes landed (or the upload is terminal) — drop the stash. */
export async function clearPendingCVUpload(): Promise<void> {
  const db = await openDB()
  if (!db) return
  await tx(db, "readwrite", (s) => s.delete(PENDING_KEY))
  db.close()
}
