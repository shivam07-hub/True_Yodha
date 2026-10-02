import { formatCount } from "@/lib/format"

/** The live count under the market loom.
 *
 * "Worth your time" is the judge's verdict. At zero opened, that verdict has
 * not been given, so the line only says how far the read has got.
 */
export function aspirationCount(read: number, pending: number, cleared: number): string | null {
  const total = read + pending
  if (total <= 0) return null
  const opened = `${formatCount(read)} of ${formatCount(total)} opened`
  if (cleared > 0) return `${opened}. ${formatCount(cleared)} worth your time.`
  return opened
}
