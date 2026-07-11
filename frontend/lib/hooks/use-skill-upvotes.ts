"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { users, type SkillUpvote, type SkillUpvotesResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

/** Normalised join key — desktop sends taxonomy keys, mobile sends display
 *  names; both surfaces (and Forge) compare through this. */
export const upvoteKey = (value: string): string => value.trim().toLowerCase()

export interface SkillUpvoteState {
  /** Total across jobs for a skill — the "N of my jobs need this" number. */
  countFor: (skill: string) => number
  /** Whether THIS job already upvoted the skill (toggle pressed-state). */
  upvotedFor: (skill: string, jobId: string) => boolean
  toggle: (skill: { skill_key: string; display_name?: string }, jobId: string) => void
  ready: boolean
}

/** Skill upvotes with instant (optimistic) toggling — the cache flips before
 *  the network answers, so the ▲ fills the moment the user taps. */
export function useSkillUpvotes(token: string | null | undefined): SkillUpvoteState {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: dataKeys.skillUpvotes(),
    queryFn: () => users.skillUpvotes(token!),
    enabled: !!token,
    staleTime: 60 * 1000,
  })

  const index = new Map<string, SkillUpvote>()
  for (const s of data?.skills ?? []) index.set(upvoteKey(s.skill_key), s)

  const mutation = useMutation({
    mutationFn: (vars: { skill_key: string; display_name?: string; job_id: string }) =>
      users.toggleSkillUpvote(token!, vars),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: dataKeys.skillUpvotes() })
      const prev = qc.getQueryData<SkillUpvotesResponse>(dataKeys.skillUpvotes())
      qc.setQueryData<SkillUpvotesResponse>(dataKeys.skillUpvotes(), (cur) => {
        const skills = [...(cur?.skills ?? [])]
        const key = upvoteKey(vars.skill_key)
        const at = skills.findIndex((s) => upvoteKey(s.skill_key) === key)
        if (at >= 0) {
          const s = skills[at]
          const had = s.job_ids.includes(vars.job_id)
          const job_ids = had ? s.job_ids.filter((j) => j !== vars.job_id) : [...s.job_ids, vars.job_id]
          if (job_ids.length === 0) skills.splice(at, 1)
          else skills[at] = { ...s, job_ids, count: job_ids.length }
        } else {
          skills.push({
            skill_key: vars.skill_key,
            display_name: vars.display_name || vars.skill_key,
            count: 1,
            job_ids: [vars.job_id],
          })
        }
        return { skills, total: skills.length }
      })
      return { prev }
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(dataKeys.skillUpvotes(), ctx.prev)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: dataKeys.skillUpvotes() })
      // The upvote also lands the skill in the Forge practice queue.
      void qc.invalidateQueries({ queryKey: dataKeys.practiceSaves() })
    },
  })

  return {
    countFor: (skill) => index.get(upvoteKey(skill))?.count ?? 0,
    upvotedFor: (skill, jobId) => index.get(upvoteKey(skill))?.job_ids.includes(jobId) ?? false,
    toggle: (skill, jobId) => mutation.mutate({ ...skill, job_id: jobId }),
    ready: !!data,
  }
}
