"use client"

/**
 * The pad Myro listens at. Auto-grows. Enter sends, Shift+Enter is a newline.
 *
 * Six hosts used to each ship a one-line <input> that invited a paragraph and
 * then hid it behind a horizontal scroll. One component kills the class.
 */

import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type KeyboardEventHandler,
  type TextareaHTMLAttributes,
} from "react"

import { remainingHint } from "@/lib/preflight/say-it"
import { cn } from "@/lib/utils"

import "./say-pad.css"

export type SayPadSize = "compose" | "compact"

type Props = {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>
  maxLength?: number
  placeholder?: string
  autoFocus?: boolean
  disabled?: boolean
  className?: string
  size?: SayPadSize
  "aria-label": string
  "aria-describedby"?: string
}

function supportsFieldSizing(): boolean {
  return typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content") === true
}

function fitFallback(el: HTMLTextAreaElement) {
  if (supportsFieldSizing()) return
  el.style.height = "0px"
  const max = Number.parseFloat(getComputedStyle(el).maxHeight)
  el.style.height = `${Math.min(el.scrollHeight, Number.isFinite(max) ? max : el.scrollHeight)}px`
}

export const SayPad = forwardRef<HTMLTextAreaElement, Props>(function SayPad(
  {
    value,
    onChange,
    onSubmit,
    onKeyDown,
    maxLength,
    placeholder,
    autoFocus,
    disabled,
    className,
    size = "compose",
    "aria-label": ariaLabel,
    "aria-describedby": ariaDescribedBy,
  },
  forwarded,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null)
  const hint = remainingHint(value.length, maxLength)

  const setRefs = (node: HTMLTextAreaElement | null) => {
    inner.current = node
    if (typeof forwarded === "function") forwarded(node)
    else if (forwarded) forwarded.current = node
  }

  useLayoutEffect(() => {
    if (inner.current) fitFallback(inner.current)
  }, [value, size])

  const extra: Pick<TextareaHTMLAttributes<HTMLTextAreaElement>, "aria-describedby"> = {}
  if (ariaDescribedBy) extra["aria-describedby"] = ariaDescribedBy

  return (
    <div className="say-pad" data-capped={hint ? "true" : undefined}>
      <textarea
        ref={setRefs}
        className={cn("say-pad-field tm-control-focus", className)}
        data-size={size}
        rows={1}
        wrap="soft"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        enterKeyHint="send"
        aria-label={ariaLabel}
        {...extra}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          const composing = e.nativeEvent.isComposing || e.keyCode === 229
          if (e.key === "Enter" && !e.shiftKey && !composing) {
            e.preventDefault()
            if (value.trim() && !disabled) onSubmit?.()
            return
          }
          onKeyDown?.(e)
        }}
      />
      {hint ? <span className="say-pad-remain">{hint}</span> : null}
    </div>
  )
})
