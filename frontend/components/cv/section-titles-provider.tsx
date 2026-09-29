"use client"

/**
 * The person's CV section headings, provided once for every authed surface.
 *
 * Every CV render — the editor paper, the PdfPage sheet every download is cut
 * from, the apply preview, the mobile editor — reads the heading here, so a
 * rename lands on all of them at once and the downloaded file is what was
 * previewed (ADR-0020). Outside the provider (public preview, tests) the
 * context is empty and every heading is the default.
 */
import { createContext, useCallback, useContext } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { users, type UserProfile } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import type { SectionKey } from "@/lib/cv/section-order"
import { sectionTitle, withSectionTitle, type SectionTitles } from "@/lib/cv/section-titles"

const SectionTitlesContext = createContext<SectionTitles | null>(null)

export function SectionTitlesProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  const { data: profile } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  const titles = (profile?.cv_section_titles ?? null) as SectionTitles | null
  return <SectionTitlesScope titles={titles}>{children}</SectionTitlesScope>
}

/** Headings from an explicit value — the authed provider's inner half, and how a
 *  render outside the app (a test, a static page) says which headings to use. */
export function SectionTitlesScope({
  titles, children,
}: {
  titles: SectionTitles | null
  children: React.ReactNode
}) {
  return <SectionTitlesContext.Provider value={titles}>{children}</SectionTitlesContext.Provider>
}

/** The heading for a section, as this person named it. */
export function useSectionTitle(): (key: SectionKey) => string {
  const titles = useContext(SectionTitlesContext)
  return useCallback((key: SectionKey) => sectionTitle(key, titles), [titles])
}

/** The raw map, for payloads that carry headings to the server (the DOCX). */
export function useSectionTitles(): SectionTitles | null {
  return useContext(SectionTitlesContext)
}

/**
 * Rename one heading. Empty, or the default, resets it. The profile cache is
 * patched first so every sheet on screen changes in the same frame; the server
 * answer replaces it.
 */
export function useRenameSection(): {
  rename: (key: SectionKey, raw: string) => void
  pending: boolean
} {
  const { token } = useAuth()
  const qc = useQueryClient()
  const titles = useContext(SectionTitlesContext)
  const mutation = useMutation({
    mutationFn: (next: SectionTitles) => {
      if (!token) throw new Error("Session not ready — please refresh.")
      return users.updateProfile(token, { cv_section_titles: next })
    },
    onMutate: (next) => {
      qc.setQueryData<UserProfile>(dataKeys.profile(), (p) => (p ? { ...p, cv_section_titles: next } : p))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: dataKeys.profile() }),
  })
  const rename = useCallback(
    (key: SectionKey, raw: string) => mutation.mutate(withSectionTitle(titles, key, raw)),
    [mutation, titles],
  )
  return { rename, pending: mutation.isPending }
}
