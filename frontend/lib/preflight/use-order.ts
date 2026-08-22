"use client"

/**
 * The one query key for the order, and the mutations both surfaces share.
 *
 * The handoff's non-negotiable: the pre-flight gate and the market bottom-sheet
 * operate on ONE targeting record. That is only true in the UI if they also
 * share a cache entry — two components each holding their own copy of "the
 * order" is exactly the split the record was introduced to close, moved one
 * layer up. So there is one key, every mutation writes the server's response
 * into it, and neither surface keeps a private copy of a line.
 *
 * Mutations are optimistic with rollback. A `yes` on a guess must feel like a
 * tap, not a request — but the server is still the one that decides, so its
 * response replaces the guess rather than confirming it.
 */

import { useRef } from "react"
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"

import { preflight } from "@/lib/api"
import type { LineKind, LineStatus, Order, OrderEffect, OrderState } from "./types"

export const preflightKeys = {
  order: () => ["preflight", "order"] as const,
}

/** Fold a mutation's response into the cached order. The mutation routes return
 *  `OrderState` only — starters, the memory count and the run price do not move
 *  when a line is answered, so they are not re-read and not overwritten. */
function mergeState(client: QueryClient, next: OrderState) {
  client.setQueryData<Order>(preflightKeys.order(), (prev) =>
    prev ? { ...prev, ...next } : undefined,
  )
}

function patchLine(client: QueryClient, lineId: string, patch: Partial<Order["lines"][number]>) {
  client.setQueryData<Order>(preflightKeys.order(), (order) =>
    order
      ? { ...order, lines: order.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }
      : undefined,
  )
}

/**
 * A failed write re-reads the server, it does not roll back to a snapshot.
 *
 * Under a queue, the snapshot taken when a click was made is several clicks
 * old by the time that click fails — restoring it would silently erase every
 * answer the user gave in between. The server is the only thing that knows
 * which of them landed, so ask it.
 */
function rereadTruth(client: QueryClient) {
  void client.invalidateQueries({ queryKey: preflightKeys.order() })
}

/**
 * Answers are serialised, and only the newest response is allowed to land.
 *
 * Tapping `yes` down a list of thirteen fires thirteen writes. Each one is a
 * read-modify-write of the whole `lines` array, so unserialised they race and
 * an answer disappears; and each intermediate response, merged as it arrives,
 * describes an order that predates the clicks the user has made since — which
 * is what made the UI look like it was ignoring taps.
 *
 * `scope` puts every line mutation in one queue (TanStack runs same-scope
 * mutations one at a time). The sequence number then discards a stale reply, so
 * the optimistic state the user is looking at is never rolled back to an older
 * truth. The optimistic patch itself still applies on click — the queue delays
 * the request, never the feedback.
 */
const LINE_SCOPE = { id: "preflight-order-line" }

export function useOrder(token: string | null, enabled = true) {
  return useQuery({
    queryKey: preflightKeys.order(),
    queryFn: () => preflight.order(token!),
    enabled: enabled && !!token,
    // The order changes only when this user changes it, and every mutation
    // writes the answer back — so a refetch on focus would replace what they
    // just did with the same thing, one network round trip later.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useOrderMutations(token: string | null) {
  const client = useQueryClient()
  // Monotonic across BOTH line mutations — they share one queue, so one counter
  // decides which reply is the newest.
  const issued = useRef(0)
  const landed = useRef(0)

  /** Merge only if nothing newer has been sent since this request left. */
  const mergeIfNewest = (seq: number, next: OrderState) => {
    if (seq < landed.current) return
    landed.current = seq
    mergeState(client, next)
  }

  const answer = useMutation({
    scope: LINE_SCOPE,
    mutationFn: ({ lineId, status }: { lineId: string; status: LineStatus; seq: number }) =>
      preflight.answerLine(token!, lineId, status),
    onError: () => rereadTruth(client),
    onSuccess: (next, vars) => mergeIfNewest(vars.seq, next),
  })

  const reword = useMutation({
    scope: LINE_SCOPE,
    mutationFn: ({ lineId, text }: { lineId: string; text: string; seq: number }) =>
      preflight.rewordLine(token!, lineId, text),
    onError: () => rereadTruth(client),
    onSuccess: (next, vars) => mergeIfNewest(vars.seq, next),
  })

  /* The two callers below patch the cache SYNCHRONOUSLY, then queue the write.
     `onMutate` would not do: with a scoped queue it runs when the request
     finally starts, so the row would sit unchanged until every earlier click
     had round-tripped — exactly the "not accepting my clicks" symptom. */
  const answerLine = (lineId: string, status: LineStatus) => {
    patchLine(client, lineId, { status })
    answer.mutate({ lineId, status, seq: ++issued.current })
  }

  // A reword counts as yes and re-labels the row — the server owns that rule,
  // so the optimistic copy states the same outcome rather than inventing one.
  const rewordLine = (lineId: string, text: string) => {
    patchLine(client, lineId, {
      text,
      status: "kept",
      source: "user_reworded",
      source_note: "reworded by you — this is what Myro runs",
      unusable: false,
    })
    reword.mutate({ lineId, text, seq: ++issued.current })
  }

  const setSaid = useMutation({
    mutationFn: (said: string) => preflight.setSaid(token!, said),
    onSuccess: (next) => mergeState(client, next),
  })

  const addLine = useMutation({
    mutationFn: (input: { kind: LineKind; text: string; origin?: "preflight" | "market" }) =>
      preflight.addLine(token!, input),
    onSuccess: (next) => mergeState(client, next),
  })

  const apply = useMutation({
    mutationFn: ({ effects, origin }: { effects: OrderEffect[]; origin?: "preflight" | "market" }) =>
      // Defaulted to "market" while the bottom-sheet was the other caller.
      // There is one door now, so an unstated origin is this one.
      preflight.apply(token!, effects, origin ?? "preflight"),
    onSuccess: (next) => mergeState(client, next),
  })

  const undo = useMutation({
    mutationFn: (entryId: string) => preflight.undo(token!, entryId),
    onSuccess: (next) => mergeState(client, next),
  })

  return { answerLine, rewordLine, setSaid, addLine, apply, undo, answer, reword }
}

/** After a run the order is stamped and the guesses are settled — both surfaces
 *  must re-read rather than keep showing pre-run counts. */
export function invalidateOrder(client: QueryClient) {
  return client.invalidateQueries({ queryKey: preflightKeys.order() })
}
