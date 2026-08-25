/**
 * rewrite-fetchers — the two places a line rewrite can go, in one shape.
 *
 * useLineRewrite owns the state machine; this owns the transport. Keeping them
 * apart is what lets the logged-out surface run the SAME machine it could not
 * run before — the anon endpoint has no `suggest_metric` mode, so the adapter
 * normalises the response instead of the component branching on which user it
 * is serving.
 *
 * 2026-08-25: the fix now travels with the request. It did not, and the result
 * was a rail row reading `Cut "leverage"` that returned the same sentence with
 * "leverage" still in it — the server was being asked to "make this stronger"
 * with no idea what the user had been promised. `intent` + `target_phrases`
 * carry the promise; fix-verify checks the answer against it on the way back.
 */
import { cv as cvApi, publicCv } from "@/lib/api"
import type { V2Fix } from "./fix-model"
import type { RewriteFetcher, RewriteResult } from "./use-line-rewrite"

/** The rewrite instruction a fix kind implies. `null` = the open-ended reframe,
 *  which is right when no specific defect was named. */
export type RewriteIntent = "cut" | "verb" | "dedupe" | null

export function intentFor(fix: V2Fix | null | undefined): RewriteIntent {
  switch (fix?.category) {
    case "buzzword": return "cut"
    case "weak-verb": return "verb"
    case "repetition": return "dedupe"
    // "unquantified" already has its own path: the metric question, which is a
    // stronger constraint than any instruction we could add here.
    default: return null
  }
}

interface FetcherOpts {
  role: string | null
  fix?: V2Fix | null
  quantifyOnly: boolean
}

export const rewriteFetcher = {
  authed(token: string, bullet: string, opts: FetcherOpts): RewriteFetcher {
    const intent = intentFor(opts.fix)
    return async ({ metric, allowNoMetric }) => {
      const res = await cvApi.rewriteBulletVariants(token, {
        bullet,
        role: opts.role,
        missing_keywords: [],
        metric,
        // A Quantify fix is satisfied only by a real number, so the reframe
        // escape is never offered to the server either (ADR-0016).
        allow_no_metric: opts.quantifyOnly ? false : allowNoMetric,
        intent: intent ?? undefined,
        target_phrases: opts.fix?.offenders ?? [],
      })
      return {
        mode: res.mode,
        variants: res.variants,
        question: res.question,
        rationale: res.rationale,
        candidateValue: res.candidate_value,
        candidateSource: res.candidate_source,
      } satisfies RewriteResult
    }
  },

  anon(bullet: string, opts: FetcherOpts): RewriteFetcher {
    const intent = intentFor(opts.fix)
    return async ({ metric, allowNoMetric }) => {
      const res = await publicCv.rewriteBulletVariants({
        bullet,
        role: opts.role,
        metric,
        allow_no_metric: opts.quantifyOnly ? false : allowNoMetric,
        intent: intent ?? undefined,
        target_phrases: opts.fix?.offenders ?? [],
      })
      return {
        mode: res.mode,
        variants: res.variants,
        question: res.question,
        rationale: res.rationale,
      } satisfies RewriteResult
    }
  },
}
