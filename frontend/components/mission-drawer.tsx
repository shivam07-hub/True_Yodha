"use client"

import { useEffect } from "react"
import { X } from "lucide-react"
import { MissionContent } from "@/components/mission-content"

interface MissionDrawerProps {
  open: boolean
  onClose: () => void
}

export function MissionDrawer({ open, onClose }: MissionDrawerProps) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  // Lock scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={[
          "fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
      />

      {/* Drawer panel — slides up from bottom */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Truth Mirror — Mission & Vision"
        className={[
          "fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-2xl rounded-t-2xl border border-border bg-background shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-y-0" : "translate-y-full",
        ].join(" ")}
        style={{ maxHeight: "92dvh" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/25" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-5 pb-10 pt-2" style={{ maxHeight: "calc(92dvh - 40px)" }}>
          <MissionContent compact showCta={false} />
        </div>
      </div>
    </>
  )
}
