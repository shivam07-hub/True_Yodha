/**
 * Where the modal opens. A signed-off order resumes on review so the work
 * is still there; a fresh start is only when the user asks for one.
 */
export function openingScreen(
  order: { last_run_at?: string | null } | undefined,
  freshStart: boolean,
): "start" | "ready" | null {
  if (!order) return null
  if (freshStart) return "start"
  return order.last_run_at ? "ready" : "start"
}
