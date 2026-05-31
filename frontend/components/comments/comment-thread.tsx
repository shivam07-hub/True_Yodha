"use client"

import "./comment-thread.css"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { comments as commentsApi } from "@/lib/api"
import type { Comment, CommentEntityType } from "@/lib/api"

function commentsKey(entityType: CommentEntityType, entityId: string) {
  return ["comments", entityType, entityId] as const
}

/** Lightweight count for card badges — shares the thread's query key, so it
 *  reuses the cached fetch rather than firing a second request. */
export function useCommentCount(token: string | null, entityType: CommentEntityType, entityId: string): number {
  const { data } = useQuery({
    queryKey: commentsKey(entityType, entityId),
    queryFn: () => commentsApi.list(token!, entityType, entityId),
    enabled: !!token && !!entityId,
    staleTime: 60 * 1000,
  })
  return data?.total ?? 0
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return "now"
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

interface CommentThreadProps {
  token: string
  entityType: CommentEntityType
  entityId: string
  placeholder?: string
}

/** Private note thread on a job or skill card (PR-B). No XP, no score
 *  coupling — own notes only, newest-first, inline edit + delete. */
export function CommentThread({ token, entityType, entityId, placeholder }: CommentThreadProps) {
  const queryClient = useQueryClient()
  const key = commentsKey(entityType, entityId)
  const [draft, setDraft] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => commentsApi.list(token, entityType, entityId),
    enabled: !!entityId,
    staleTime: 60 * 1000,
  })
  const notes = data?.comments ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key })

  const create = useMutation({
    mutationFn: () => commentsApi.create(token, entityType, entityId, draft.trim()),
    onSuccess: () => { setDraft(""); invalidate() },
  })
  const update = useMutation({
    mutationFn: (vars: { id: string; body: string }) => commentsApi.update(token, vars.id, vars.body.trim()),
    onSuccess: () => { setEditingId(null); setEditDraft(""); invalidate() },
  })
  const remove = useMutation({
    mutationFn: (id: string) => commentsApi.remove(token, id),
    onSuccess: invalidate,
  })

  function submitDraft() {
    if (!draft.trim() || create.isPending) return
    create.mutate()
  }

  return (
    <div className="tm-cmt">
      <div className="tm-cmt-compose">
        <textarea
          className="tm-cmt-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitDraft() }}
          placeholder={placeholder ?? "Add a note…"}
          rows={2}
        />
        <button
          type="button"
          className="tm-cmt-add tm-control-focus"
          onClick={submitDraft}
          disabled={!draft.trim() || create.isPending}
        >
          {create.isPending ? "Saving…" : "Add note"}
        </button>
      </div>

      {isLoading ? (
        <div className="tm-cmt-empty">Loading notes…</div>
      ) : notes.length === 0 ? (
        <div className="tm-cmt-empty">No notes yet — jot what you tried, learned, or want to remember.</div>
      ) : (
        <ul className="tm-cmt-list">
          {notes.map((note: Comment) => (
            <li key={note.id} className="tm-cmt-item">
              {editingId === note.id ? (
                <div className="tm-cmt-edit">
                  <textarea
                    className="tm-cmt-input"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={2}
                    autoFocus
                  />
                  <div className="tm-cmt-edit-actions">
                    <button
                      type="button"
                      className="tm-cmt-save tm-control-focus"
                      onClick={() => editDraft.trim() && update.mutate({ id: note.id, body: editDraft })}
                      disabled={!editDraft.trim() || update.isPending}
                    >
                      {update.isPending ? "Saving…" : "Save"}
                    </button>
                    <button type="button" className="tm-cmt-ghost tm-control-focus" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="tm-cmt-body">{note.body}</p>
                  <div className="tm-cmt-foot">
                    <span className="tm-cmt-time">{relativeTime(note.created_at)}</span>
                    <button type="button" className="tm-cmt-icon tm-control-focus" aria-label="Edit note"
                      onClick={() => { setEditingId(note.id); setEditDraft(note.body) }}>✎</button>
                    <button type="button" className="tm-cmt-icon tm-control-focus" aria-label="Delete note"
                      onClick={() => remove.mutate(note.id)} disabled={remove.isPending}>✕</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
