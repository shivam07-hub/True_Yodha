/**
 * A signed-out visit to /account/delete comes back there after sign-in.
 *
 * sessionStorage survives the OAuth full-page redirect. postAuthDestination
 * reads `hasAccountDeletionReturn`. There is still no caller-supplied URL.
 */
const RETURN_KEY = "myro_account_deletion_return_v1"

export function stashAccountDeletionReturn(): void {
  try {
    sessionStorage.setItem(RETURN_KEY, "1")
  } catch {
    // Without storage, sign-in lands on Jobs. The page is one link from Privacy.
  }
}

export function hasAccountDeletionReturn(): boolean {
  try {
    return sessionStorage.getItem(RETURN_KEY) === "1"
  } catch {
    return false
  }
}

/** They are back on the page; the return has done its job. */
export function clearAccountDeletionReturn(): void {
  try {
    sessionStorage.removeItem(RETURN_KEY)
  } catch {
    // nothing to clear
  }
}
