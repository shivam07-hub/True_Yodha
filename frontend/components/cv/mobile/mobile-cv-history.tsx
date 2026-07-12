"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AppliedVersionsPanel } from "@/components/cv/builder/applied-versions"

interface Props {
  token: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Version history = the CVs you APPLIED with (Delta-4, project_living_cv_delta4).
// WIP autosaves are no longer surfaced as "versions" — a version is a completed,
// applied CV, browsable + restorable like Google Docs history.
export function MobileCVHistory({ token, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>Every CV you&apos;ve applied with. Re-download any, or restore it as your Main CV.</DialogDescription>
        </DialogHeader>
        <div className="tm-mcv-history-list">
          {open && <AppliedVersionsPanel token={token} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
