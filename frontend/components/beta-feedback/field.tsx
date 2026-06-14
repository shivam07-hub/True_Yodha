import type { ReactNode } from "react"

export function BetaField({
  id,
  label,
  error,
  optional = false,
  children,
}: {
  id: string
  label: string
  error?: string
  optional?: boolean
  children: ReactNode
}) {
  const errorId = `${id}-error`
  return (
    <div className="bf-field">
      <label className="bf-label" htmlFor={id}>
        {label}
        {optional && <span className="bf-optional">Optional</span>}
      </label>
      {children}
      {error && (
        <p className="bf-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function describedBy(id: string, error?: string): string | undefined {
  return error ? `${id}-error` : undefined
}
