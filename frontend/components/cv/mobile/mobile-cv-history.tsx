"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { cv, type MasterRevision } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Props {
  token: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileCVHistory({ token, open, onOpenChange }: Props) {
  const [confirmRevisionId, setConfirmRevisionId] = useState<number | null>(null)
  const queryClient = useQueryClient()
  const revisionsQuery = useQuery({
    queryKey: ["cv-master-revisions"],
    queryFn: () => cv.masterRevisions(token),
    enabled: open,
    staleTime: 30_000,
  })
  const sessions = useMemo(
    () => sessionCheckpoints(revisionsQuery.data?.revisions ?? []),
    [revisionsQuery.data],
  )
  const restore = useMutation({
    mutationFn: (revisionId: number) => cv.restoreMasterRevision(token, revisionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.cvStructured() })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvVersions(null) })
      queryClient.invalidateQueries({ queryKey: ["cv-master-revisions"] })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Main CV history</DialogTitle>
          <DialogDescription>Session checkpoints only. Restoring preserves your current CV in history.</DialogDescription>
        </DialogHeader>
        <div className="tm-mcv-history-list">
          {revisionsQuery.isLoading && <p role="status">Loading history…</p>}
          {!revisionsQuery.isLoading && sessions.length === 0 && <p>No earlier editing sessions yet.</p>}
          {sessions.map(revision => (
            <div key={revision.id}>
              <span>
                <strong>{formatDate(revision.created_at)}</strong>
                <small>Revision {revision.revision_number}</small>
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmRevisionId(revision.id)}>Restore</Button>
              <Dialog open={confirmRevisionId === revision.id} onOpenChange={nextOpen => setConfirmRevisionId(nextOpen ? revision.id : null)}>
                <DialogContent showCloseButton={false}>
                  <DialogTitle>Restore this CV?</DialogTitle>
                  <DialogDescription>Your current Main CV will remain available as the newest history checkpoint.</DialogDescription>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setConfirmRevisionId(null)}>Cancel</Button>
                    <Button
                      type="button"
                      disabled={restore.isPending}
                      onClick={() => {
                        restore.mutate(revision.id)
                        setConfirmRevisionId(null)
                      }}
                    >
                      Restore
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ))}
          {restore.isError && <p className="tm-mcv-inline-error" role="alert">Couldn’t restore this revision.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function sessionCheckpoints(revisions: MasterRevision[]): MasterRevision[] {
  const sorted = [...revisions].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  return sorted.filter((revision, index) => {
    if (index === 0) return true
    const previous = sorted[index - 1]
    return Math.abs(Date.parse(previous.created_at) - Date.parse(revision.created_at)) >= 30 * 60 * 1000
  })
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}
