import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/*
 * Canonical Myro CTA primitive — Phase 1 of the CTA consolidation.
 * Variants and sizes follow docs/CTA_DESIGN_SPEC.md ("Cast & Stamped").
 * All colors reference --tm-* tokens so the component themes correctly across
 * the cyan, teal, amber, and brown accent palettes.
 *
 * Variants: solid · outline · ghost · inline
 * Sizes:    sm · md (default) · lg · icon-sm · icon-md
 *
 * Use `render={<Link href="..." />}` (Base UI pattern) to project the button
 * styles onto an anchor for navigation CTAs.
 */
const buttonVariants = cva(
  cn(
    "group/button inline-flex shrink-0 items-center justify-center",
    "border bg-clip-padding font-medium whitespace-nowrap select-none cursor-pointer",
    "outline-none",
    // Stamp metaphor: press translates +1px (Spec § 2). Honors prefers-reduced-motion.
    "motion-safe:active:translate-y-px",
    // Spec § 4 — single transition applied to every animated property
    "transition-[background,color,border-color,box-shadow,transform,filter] duration-[var(--tm-dur)] ease-[var(--tm-ease)]",
    "motion-safe:active:duration-[var(--tm-dur-fast)]",
    // Disabled — drained saturation (Spec § 2 solid disabled, applied universally)
    "disabled:cursor-not-allowed disabled:opacity-60 disabled:[filter:saturate(0.35)]",
    // SVG defaults
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ),
  {
    variants: {
      variant: {
        // ── solid · the cast button ─────────────────────────────────────────
        solid: cn(
          "bg-[var(--tm-interactive)] text-[var(--tm-interactive-fg)] border-[var(--tm-interactive)]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_0_rgba(0,0,0,0.08)]",
          "hover:bg-[var(--tm-interactive-hover)] hover:border-[var(--tm-interactive-hover)]",
          "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_2px_6px_rgba(0,0,0,0.10)]",
          "active:bg-[var(--tm-interactive-press)] active:border-[var(--tm-interactive-press)]",
          "active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.18)]",
          "focus-visible:outline-2 focus-visible:outline-[var(--tm-int-border)] focus-visible:outline-offset-2",
        ),
        // ── outline · the considered button ─────────────────────────────────
        outline: cn(
          "bg-transparent text-[var(--tm-interactive)] border-[var(--tm-int-border)]",
          "hover:bg-[var(--tm-int-bg-wash)] hover:border-[var(--tm-interactive)]",
          "active:bg-[var(--tm-int-bg-wash)] active:border-[var(--tm-interactive-press)] active:text-[var(--tm-interactive-press)]",
          "focus-visible:outline-2 focus-visible:outline-[var(--tm-int-border)] focus-visible:outline-offset-2",
        ),
        // ── ghost · the utility button ──────────────────────────────────────
        ghost: cn(
          "bg-transparent text-[var(--tm-text-muted)] border-transparent",
          "hover:bg-[var(--tm-hover)] hover:text-[var(--tm-text)]",
          "active:bg-[var(--tm-hover)]",
          "aria-pressed:bg-[var(--tm-int-bg-wash)] aria-pressed:text-[var(--tm-interactive)] aria-pressed:border-[var(--tm-int-border)]",
          "focus-visible:outline-2 focus-visible:outline-[var(--tm-int-border)] focus-visible:outline-offset-2",
        ),
        // ── inline · the prose link (NOT a box) ─────────────────────────────
        inline: cn(
          "!inline !p-0 !h-auto !rounded-none !border-0 !shadow-none !min-w-0",
          "bg-transparent text-[var(--tm-interactive)] font-[inherit] text-[length:inherit]",
          "underline underline-offset-[3px] decoration-1",
          "hover:text-[var(--tm-interactive-hover)] hover:decoration-2",
          "active:text-[var(--tm-interactive-press)]",
          "motion-safe:active:!translate-y-0",
          "focus-visible:outline-2 focus-visible:outline-[var(--tm-int-border)] focus-visible:outline-offset-[3px] focus-visible:!rounded-[2px]",
        ),
      },
      size: {
        sm: "h-8 px-3 gap-1.5 text-[0.8125rem] rounded-[var(--tm-radius-sm)] [&_svg:not([class*='size-'])]:size-3.5",
        md: "h-10 px-4 gap-2 text-[0.9375rem] rounded-[var(--tm-radius)] [&_svg:not([class*='size-'])]:size-4",
        lg: "h-12 px-[1.375rem] gap-2 text-[1.0625rem] rounded-[var(--tm-radius)] [&_svg:not([class*='size-'])]:size-5",
        "icon-sm": "size-8 rounded-[var(--tm-radius-sm)] [&_svg:not([class*='size-'])]:size-4",
        "icon-md": "size-10 rounded-[var(--tm-radius)] [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "solid",
      size: "md",
    },
  }
)

type ButtonOwnProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & {
  loading?: boolean
}

function ButtonLoader() {
  return (
    <span
      aria-hidden="true"
      className="font-mono inline-flex items-center gap-[2px] tabular-nums leading-none"
    >
      <span className="motion-safe:animate-pulse [animation-delay:0ms]">·</span>
      <span className="motion-safe:animate-pulse [animation-delay:120ms]">·</span>
      <span className="motion-safe:animate-pulse [animation-delay:240ms]">·</span>
    </span>
  )
}

function Button({
  className,
  variant = "solid",
  size = "md",
  loading,
  disabled,
  children,
  ...props
}: ButtonOwnProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-loading={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? <ButtonLoader /> : children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
