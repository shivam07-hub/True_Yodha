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
  const prev = client.getQueryData<Order>(preflightKeys.order())
  client.setQueryData<Order>(preflightKeys.order(), (order) =>
    order
      ? { ...order, lines: order.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }
      : undefined,
  )
  return prev
}

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

  const answer = useMutation({
    mutationFn: ({ lineId, status }: { lineId: string; status: LineStatus }) =>
      preflight.answerLine(token!, lineId, status),
    onMutate: ({ lineId, status }) => ({ prev: patchLine(client, lineId, { status }) }),
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) client.setQueryData(preflightKeys.order(), ctx.prev)
    },
    onSuccess: (next) => mergeState(client, next),
  })

  const reword = useMutation({
    mutationFn: ({ lineId, text }: { lineId: string; text: string }) =>
      preflight.rewordLine(token!, lineId, text),
    // A reword counts as yes and re-labels the row — the server owns that rule,
    // so the optimistic copy states the same outcome rather than inventing one.
    onMutate: ({ lineId, text }) => ({
      prev: patchLine(client, lineId, {
        text,
        status: "kept",
        source: "user_reworded",
        source_note: "reworded by you — this is what Myro runs",
        unusable: false,
      }),
    }),
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) client.setQueryData(preflightKeys.order(), ctx.prev)
    },
    onSuccess: (next) => mergeState(client, next),
  })

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
      preflight.apply(token!, effects, origin ?? "market"),
    onSuccess: (next) => mergeState(client, next),
  })

  const undo = useMutation({
    mutationFn: (entryId: string) => preflight.undo(token!, entryId),
    onSuccess: (next) => mergeState(client, next),
  })

  return { answer, reword, setSaid, addLine, apply, undo }
}

/** After a run the order is stamped and the guesses are settled — both surfaces
 *  must re-read rather than keep showing pre-run counts. */
export function invalidateOrder(client: QueryClient) {
  return client.invalidateQueries({ queryKey: preflightKeys.order() })
}
