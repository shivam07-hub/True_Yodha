import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      // Variants speak the app's --tm-* token language (not stock shadcn
      // semantic tokens) so a Badge looks native everywhere — that is why this
      // is now the one source for status/count/label pills.
      variant: {
        /** Accent solid — an emphatic count (unread, following). */
        default: "bg-[var(--tm-interactive)] text-[var(--tm-interactive-fg)] border-transparent",
        /** Subtle neutral — a low-priority / overflow count like "9+". */
        neutral: "bg-[var(--tm-hover-soft)] text-[var(--tm-text-muted)] border-[var(--tm-border)]",
        /** Accent wash — a soft category / skill chip. */
        soft: "bg-[var(--tm-int-bg-wash)] text-[var(--tm-interactive)] border-[var(--tm-int-border)]",
        /** Positive status. */
        success: "bg-[var(--tm-success-wash)] text-[var(--tm-success)] border-[var(--tm-success)]",
        /** Attention status. */
        warning: "bg-[var(--tm-warning-wash)] text-[var(--tm-warning)] border-[var(--tm-warning)]",
        /** Neutral outline — a meta tag. */
        outline: "bg-transparent text-[var(--tm-text-muted)] border-[var(--tm-border-soft)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
