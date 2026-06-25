"use client"

import "./comment-thread.css"

import Link from "next/link"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { comments as commentsApi } from "@/lib/api"
import type { Comment, CommentEntityType } from "@/lib/api"
import { formatDate } from "@/lib/format"

function commentsKey(entityType: CommentEntityType, entityId: string) {
  return ["comments", entityType, entityId] as const
}

/** Lightweight count for card badges — shares the thread's query key, so it
 *  reuses the cached fetch rather than firing a second request. Public read,
 *  so it works signed-out too (token may be null). */
export function useCommentCount(token: string | null, entityType: CommentEntityType, entityId: string): number {
  const { data } = useQuery({
    queryKey: commentsKey(entityType, entityId),
    queryFn: () => commentsApi.list(token, entityType, entityId),
    enabled: !!entityId,
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
  return formatDate(iso, "short")
}

interface CommentThreadProps {
  /** Auth token. null/empty ⇒ signed-out: feed is read-only. */
  token: string | null
  entityType: CommentEntityType
  entityId: string
  placeholder?: string
}

/** PUBLIC community-notes feed on a job / company / skill entity. Anyone reads;
 *  signed-in users post (multi-note allowed), edit/delete their own, and flag
 *  others'. Author shown via ninja_name (links to their public profile); never
 *  the real identity. */
export function CommentThread({ token, entityType, entityId, placeholder }: CommentThreadProps) {
  const queryClient = useQueryClient()
  const key = commentsKey(entityType, entityId)
  const [draft, setDraft] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const signedIn = !!token

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => commentsApi.list(token, entityType, entityId),
    enabled: !!entityId,
    staleTime: 60 * 1000,
  })
  const notes = data?.comments ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key })

  const create = useMutation({
    mutationFn: () => commentsApi.create(token as string, entityType, entityId, draft.trim()),
    onSuccess: () => { setDraft(""); invalidate() },
  })
  const update = useMutation({
    mutationFn: (vars: { id: string; body: string }) => commentsApi.update(token as string, vars.id, vars.body.trim()),
    onSuccess: () => { setEditingId(null); setEditDraft(""); invalidate() },
  })
  const remove = useMutation({
    mutationFn: (id: string) => commentsApi.remove(token as string, id),
    onSuccess: invalidate,
  })
  const flag = useMutation({
    mutationFn: (id: string) => commentsApi.flag(token as string, id),
    onSuccess: invalidate,
  })

  function submitDraft() {
    if (!draft.trim() || create.isPending || !signedIn) return
    create.mutate()
  }

  return (
    <div className="tm-cmt">
      {signedIn ? (
        <div className="tm-cmt-compose">
          <textarea
            className="tm-cmt-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitDraft() }}
            placeholder={placeholder ?? "Leave a note for others…"}
            rows={2}
          />
          <button
            type="button"
            className="tm-cmt-add tm-control-focus"
            onClick={submitDraft}
            disabled={!draft.trim() || create.isPending}
          >
            {create.isPending ? "Posting…" : "Post note"}
          </button>
        </div>
      ) : (
        <div className="tm-cmt-signin">
          <Link href="/login" className="tm-cmt-signin-link">Sign in</Link> to leave a note.
        </div>
      )}
      {create.isError ? (
        <div className="tm-cmt-error">Couldn’t post — you may have hit today’s note limit.</div>
      ) : null}

      {isLoading ? (
        <div className="tm-cmt-empty">Loading notes…</div>
      ) : notes.length === 0 ? (
        <div className="tm-cmt-empty">No notes yet. Be the first to share what you know.</div>
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
                    {note.author_ninja_name ? (
                      <Link href={`/profile/${note.author_ninja_name}`} className="tm-cmt-author">
                        {note.author_ninja_name}
                      </Link>
                    ) : (
                      <span className="tm-cmt-author tm-cmt-author-anon">A Myro user</span>
                    )}
                    <span className="tm-cmt-time">{relativeTime(note.created_at)}</span>
                    {note.is_own ? (
                      <>
                        <button type="button" className="tm-cmt-icon tm-control-focus" aria-label="Edit note"
                          onClick={() => { setEditingId(note.id); setEditDraft(note.body) }}>✎</button>
                        <button type="button" className="tm-cmt-icon tm-control-focus" aria-label="Delete note"
                          onClick={() => remove.mutate(note.id)} disabled={remove.isPending}>✕</button>
                      </>
                    ) : signedIn ? (
                      <button type="button" className="tm-cmt-icon tm-control-focus" aria-label="Report note"
                        title="Report this note"
                        onClick={() => flag.mutate(note.id)} disabled={flag.isPending}>⚑</button>
                    ) : null}
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
