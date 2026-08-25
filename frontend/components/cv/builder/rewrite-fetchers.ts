/**
 * rewrite-fetchers — the two places a line rewrite can go, in one shape.
 *
 * useLineRewrite owns the state machine; this owns the transport. Keeping them
 * apart is what lets the logged-out surface run the SAME machine it could not
 * run before — the anon endpoint has no `suggest_metric` mode, so the adapter
 * normalises the response instead of the component branching on which user it
 * is serving.
 */
import { cv as cvApi, publicCv } from "@/lib/api"
import type { RewriteFetcher, RewriteResult } from "./use-line-rewrite"

export const rewriteFetcher = {
  authed(
    token: string,
    bullet: string,
    role: string | null,
    quantifyOnly: boolean,
  ): RewriteFetcher {
    return async ({ metric, allowNoMetric }) => {
      const res = await cvApi.rewriteBulletVariants(token, {
        bullet,
        role,
        missing_keywords: [],
        metric,
        // A Quantify fix is satisfied only by a real number, so the reframe
        // escape is never offered to the server either (ADR-0016).
        allow_no_metric: quantifyOnly ? false : allowNoMetric,
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

  anon(bullet: string, role: string | null, quantifyOnly: boolean): RewriteFetcher {
    return async ({ metric, allowNoMetric }) => {
      const res = await publicCv.rewriteBulletVariants({
        bullet,
        role,
        metric,
        allow_no_metric: quantifyOnly ? false : allowNoMetric,
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
