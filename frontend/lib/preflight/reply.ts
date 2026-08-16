/**
 * Pre-flight's Myro bubble is an acknowledgement, never a question.
 * A question with no yes/no is a dead end — those belong as proposal rows.
 */
export function ackFromReply(reply: string): string {
  const text = reply.trim()
  if (!text || text.includes("?")) return ""
  return text
}
