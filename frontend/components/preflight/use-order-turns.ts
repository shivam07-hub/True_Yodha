"use client"

/**
 * Every network turn this modal can take, in one place.
 *
 * Lifted out of `preflight-gate.tsx`, which was 434 lines against the 300-line
 * rule and had been over it before this session started. The seam is the one
 * the gate's own docstring already named: the shell owns the modal, the escape
 * key and the three lifecycle modes; this owns what happens when the user says
 * something, answers a guess, adds a line, or takes one back.
 *
 * It calls `useOrderMutations` ONCE and re-exports what the shell still needs.
 * Two instances would each hold their own `issued`/`landed` counters, and those
 * counters are what stop a stale reply landing on top of a newer answer — the
 * "it is not accepting my clicks" bug.
 *
 * What stays in the shell: `run`, because it drives the wait modes and the
 * shared refresh VM, and `undoable`, because it is a question about the order
 * and the log baseline the shell holds.
 */

import { useCallback, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { preflight, tracks as tracksApi } from "@/lib/api"
import { invalidateTargetRoleData } from "@/lib/domain-data"
import { applyErrorMessage } from "@/lib/preflight/apply-error"
import { invalidateOrder, useOrderMutations } from "@/lib/preflight/use-order"
import type { LineKind, OrderProposal } from "@/lib/preflight/types"

type Verdict = "kept" | "dropped" | null

export function useOrderTurns(token: string | null) {
  const client = useQueryClient()
  const { answerLine, rewordLine, addLine, apply, undo } = useOrderMutations(token)

  const [proposals, setProposals] = useState<OrderProposal[]>([])
  const [proposalAnswers, setProposalAnswers] = useState<Record<string, Verdict>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Only the newest turn may land. A second utterance sent while the first is
   *  still thinking must not have its proposals overwritten by the older reply
   *  arriving late. */
  const turnRef = useRef(0)

  /** Ephemeral state, cleared on every open — the order itself stays cached. */
  const reset = useCallback(() => {
    setProposals([])
    setProposalAnswers({})
    setPending(false)
    setError(null)
    turnRef.current += 1
  }, [])

  const undoLast = useCallback(async (entryId: string) => {
    setError(null)
    try {
      await undo.mutateAsync(entryId)
    } catch (err) {
      setError(applyErrorMessage(err))
      await invalidateOrder(client)
    }
  }, [client, undo])

  // ── conversation turn: something new the user said ─────────────────────────
  const saySomething = useCallback(async (text: string) => {
    if (!token) return
    const turn = ++turnRef.current
    setPending(true); setError(null)
    try {
      // The server owns what "the user just said" means. Storing it first means
      // proposals reference the same order revision the review does.
      await preflight.setSaid(token, text)
      if (turn !== turnRef.current) return
      const res = await preflight.proposals(token, { utterance: text })
      if (turn !== turnRef.current) return
      setProposals(res.proposals)
      setProposalAnswers({})
      await invalidateOrder(client)
    } catch {
      if (turn !== turnRef.current) return
      setError("Myro couldn't read that just then. Your words are saved — try again.")
    } finally {
      if (turn === turnRef.current) setPending(false)
    }
  }, [client, token])

  /**
   * A named topic — the deterministic half of "something's off".
   *
   * `proposals.from_topic` answers it off a table: no LLM turn, no cost, and it
   * can strike a kept line the topic is about ("no senior management" is what
   * caps the level). A chip is only worth offering INSTEAD of a blank line
   * because of that — routing it through the mentor as a sentence, which is
   * what the say band did on its first pass, spends a turn re-deriving
   * something the click already said.
   *
   * It does not touch `said`: sentence one of the brief is the work the user
   * wants, not the complaint they have about the results.
   */
  const proposeTopic = useCallback(async (topic: string) => {
    if (!token) return
    const turn = ++turnRef.current
    setPending(true); setError(null)
    try {
      const res = await preflight.proposals(token, { topic })
      if (turn !== turnRef.current) return
      setProposals(res.proposals)
      setProposalAnswers({})
    } catch {
      if (turn !== turnRef.current) return
      setError("Myro couldn't read that just then. Nothing changed — try again.")
    } finally {
      if (turn === turnRef.current) setPending(false)
    }
  }, [token])

  // A proposal accepted here writes the same effect the old batch commit did,
  // one at a time — the server dedupes and every apply reads the fresh order.
  const answerProposal = useCallback(async (id: string, verdict: Verdict) => {
    setProposalAnswers((prev) => ({ ...prev, [id]: verdict }))
    if (verdict !== "kept") return
    const proposal = proposals.find((p) => p.id === id)
    if (!proposal) return

    /**
     * A SECOND SEARCH is not an order edit.
     *
     * `/order/apply` acts on add and drop, so an `open_track` effect sent there
     * is a silent no-op — the user would say yes and nothing would exist. It
     * goes to `POST /tracks`, which re-checks the gate at write time: the
     * proposal was built when `can_open` was true, and it may not be by the
     * time the yes lands. A 409 there is not a failure to hide, it is the
     * reason, and the server writes it in words that never say "locked".
     */
    const track = proposal.effects.find((e) => e.op === "open_track")
    if (track) {
      try {
        await tracksApi.open(token!, {
          label: track.text,
          role_titles: track.role_titles ?? [],
        })
      } catch (err) {
        setError((err as Error)?.message || "Couldn't open that search just now.")
        setProposalAnswers((prev) => ({ ...prev, [id]: null }))
      }
      return
    }

    try {
      await apply.mutateAsync({ effects: proposal.effects, origin: "preflight" })
      // Narrowing is free: the roles already scored can be re-read against the
      // new order without a run. The market sheet did this and the gate did
      // not, so the same accepted proposal changed the feed from one door and
      // not the other.
      //
      // A WIDENING proposal is the opposite — it brings roles into scope that
      // have never been rated, and re-reading cannot rate them. Refetching the
      // feed there spends a read to show the user the same list, which is how
      // "I accepted it and nothing happened" becomes "I accepted it and it took
      // a second to not happen". The server already classifies which is which;
      // it just had nobody listening.
      if (!proposal.costly) invalidateTargetRoleData(client)
    } catch (err) {
      // Keep the server's reason — a 409 says the order changed elsewhere and
      // the user needs to see it, not a generic "didn't stick".
      setError(applyErrorMessage(err))
      setProposalAnswers((prev) => ({ ...prev, [id]: null }))
      await invalidateOrder(client)
    }
  }, [apply, client, proposals, token])

  /**
   * A line added straight into a slot.
   *
   * No proposals round trip and no LLM turn: the user picked the slot by
   * picking which "+" to press, so the kind is already known. That makes the
   * add deterministic, instant and free — the conversational path stays for the
   * case where they have a sentence rather than a line.
   */
  const addToSlot = useCallback(async (kind: LineKind, text: string, roleFamily?: string) => {
    if (!token) return
    setError(null)
    try {
      await addLine.mutateAsync({ kind, text, origin: "preflight", role_family: roleFamily })
    } catch (err) {
      setError(applyErrorMessage(err))
      await invalidateOrder(client)
    }
  }, [addLine, client, token])

  return {
    answerLine,
    rewordLine,
    proposals,
    proposalAnswers,
    pending,
    error,
    setError,
    reset,
    undoLast,
    saySomething,
    proposeTopic,
    answerProposal,
    addToSlot,
  }
}
