const assignmentPattern = /\b(?:authorization|proxy-authorization|api[-_]?key|apikey|client[-_]?secret|access[-_]?token|refresh[-_]?token|password|passwd|secret|token)\b\s*[:=]\s*[^\s,;&}\]]+/gi
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi
const jwtPattern = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
const connectionPattern = /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|redis|mysql|mssql):\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/gi
const providerKeyPattern = /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b|\b(?:AIza|AKIA)[A-Za-z0-9_-]{12,}\b|\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{12,}\b/g

export function redactSensitiveText(value: unknown, maxLength = 1200): string {
  let text = String(value)
  text = text.replace(connectionPattern, "[REDACTED_CONNECTION_URL]")
  text = text.replace(bearerPattern, "Bearer [REDACTED]")
  text = text.replace(assignmentPattern, (match) => match.replace(/[^\s:=]+$/, "[REDACTED]"))
  text = text.replace(jwtPattern, "[REDACTED_JWT]")
  text = text.replace(providerKeyPattern, "[REDACTED_PROVIDER_KEY]")
  return text.slice(0, maxLength)
}
