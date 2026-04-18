"use client"

import { useState } from "react"
import { Bug, Building2, MessageSquare, CheckCircle2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type WidgetType = "feedback" | "company" | "bug"

interface WidgetConfig {
  type: WidgetType
  icon: React.ReactNode
  label: string
  title: string
  description: string
  fields: FieldConfig[]
  color: string
  hoverBg: string
}

interface FieldConfig {
  key: string
  label: string
  placeholder: string
  type: "text" | "textarea"
}

const WIDGETS: WidgetConfig[] = [
  {
    type: "feedback",
    icon: <MessageSquare className="size-4" />,
    label: "Feedback",
    title: "Leave feedback",
    description: "Tell us what's working or what could be better.",
    color: "text-blue-500",
    hoverBg: "hover:bg-blue-500/10 hover:border-blue-500/40",
    fields: [
      {
        key: "message",
        label: "Your feedback",
        placeholder: "What's on your mind?",
        type: "textarea",
      },
    ],
  },
  {
    type: "company",
    icon: <Building2 className="size-4" />,
    label: "Suggest company",
    title: "Suggest a company to track",
    description: "Know a company we should add to the job feed?",
    color: "text-violet-500",
    hoverBg: "hover:bg-violet-500/10 hover:border-violet-500/40",
    fields: [
      {
        key: "company",
        label: "Company name",
        placeholder: "e.g. Stripe, Notion, Zepto…",
        type: "text",
      },
      {
        key: "reason",
        label: "Why track it?",
        placeholder: "Great DE roles, hiring in India, etc.",
        type: "textarea",
      },
    ],
  },
  {
    type: "bug",
    icon: <Bug className="size-4" />,
    label: "Report bug",
    title: "Report a bug",
    description: "Something broken? We'll fix it fast.",
    color: "text-red-500",
    hoverBg: "hover:bg-red-500/10 hover:border-red-500/40",
    fields: [
      {
        key: "location",
        label: "Where did it happen?",
        placeholder: "e.g. Dashboard, CV upload, Job matcher…",
        type: "text",
      },
      {
        key: "description",
        label: "What happened?",
        placeholder: "Steps to reproduce, what you expected vs. what you saw…",
        type: "textarea",
      },
    ],
  },
]

function FeedbackForm({
  config,
  onClose,
}: {
  config: WidgetConfig
  onClose: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  function handleChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    // TODO: wire to POST /api/feedback with { type: config.type, ...values }
    await new Promise((r) => setTimeout(r, 600))
    setLoading(false)
    setSubmitted(true)
    setTimeout(onClose, 1800)
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-10 text-green-500" />
        <p className="font-medium text-sm">Got it — thanks!</p>
        <p className="text-xs text-muted-foreground">We&apos;ll take a look.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {config.fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground">
            {field.label}
          </label>
          {field.type === "textarea" ? (
            <textarea
              className="min-h-[90px] w-full resize-none rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              onChange={(e) => handleChange(field.key, e.target.value)}
              required
            />
          ) : (
            <input
              type="text"
              className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              onChange={(e) => handleChange(field.key, e.target.value)}
              required
            />
          )}
        </div>
      ))}

      <DialogFooter>
        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
          {loading ? "Sending…" : "Send"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function FeedbackWidget() {
  const [open, setOpen] = useState<WidgetType | null>(null)

  const activeConfig = WIDGETS.find((w) => w.type === open) ?? null

  return (
    <>
      {/* Floating pill — fixed bottom-right */}
      <div className="fixed bottom-6 right-5 z-40 flex flex-col items-end gap-2">
        {WIDGETS.map((w) => (
          <div key={w.type} className="group flex items-center gap-2">
            {/* Tooltip label — slides in from right on hover */}
            <span
              className="pointer-events-none whitespace-nowrap rounded-md bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground ring-1 ring-foreground/10 opacity-0 translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0"
            >
              {w.label}
            </span>

            {/* Icon button */}
            <button
              type="button"
              onClick={() => setOpen(w.type)}
              aria-label={w.label}
              className={`flex size-10 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm backdrop-blur-sm transition-all duration-150 ${w.color} ${w.hoverBg} hover:scale-105 hover:shadow-md active:scale-95`}
            >
              {w.icon}
            </button>
          </div>
        ))}
      </div>

      {/* Dialog */}
      <Dialog
        open={open !== null}
        onOpenChange={(isOpen) => { if (!isOpen) setOpen(null) }}
      >
        {activeConfig && (
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className={activeConfig.color}>{activeConfig.icon}</span>
                {activeConfig.title}
              </DialogTitle>
              <DialogDescription>{activeConfig.description}</DialogDescription>
            </DialogHeader>
            <FeedbackForm
              config={activeConfig}
              onClose={() => setOpen(null)}
            />
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
