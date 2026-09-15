/**
 * What the CV view says while Myro brings a returning user forward — pure.
 *
 * Same split as `story-questions-queue`: the branching lives apart from the
 * component so it can be asserted without a query client or a DOM. These are
 * the rules that decide whether a panel appears on a page the user did not ask
 * for it on, which is exactly the kind of rule worth pinning.
 */
import type { CareerProfile, ReservoirStatus } from "@/lib/api"

export type ForwardPassMode =
  /** Nothing in flight and nothing recent — the panel does not exist. */
  | "hidden"
  /** An ingest is running. A spinner here is honest, and it is the only thing
   *  the user needs: the questions do not exist yet. */
  | "working"
  /** A CV landed. The bullets it could not finish are the completion queue, and
   *  handing them over IS the point of saying anything at all. */
  | "landed"

export interface ForwardPassState {
  mode: ForwardPassMode
  /** Poll only while something is actually in flight. A four-second poll that
   *  never stops is a page-load cost charged forever. */
  poll: boolean
  /** Pay the full profile read once, and only after something landed. */
  wantsProfile: boolean
}

export function forwardPassState(
  status: ReservoirStatus | undefined,
  profile: CareerProfile | undefined,
): ForwardPassState {
  const pending = status?.pending ?? 0
  if (pending > 0) return { mode: "working", poll: true, wantsProfile: false }

  if (!status?.banked_recently) return { mode: "hidden", poll: false, wantsProfile: false }

  // Landed, but the read has not come back yet — say nothing rather than flash a
  // heading that is about to be contradicted.
  if (!profile) return { mode: "hidden", poll: false, wantsProfile: true }

  // The extraction produced nothing. Announcing a zero is worse than silence,
  // and it is the honest outcome for a CV that is one line of contact details.
  if (profile.story_count === 0) return { mode: "hidden", poll: false, wantsProfile: true }

  return { mode: "landed", poll: false, wantsProfile: true }
}
