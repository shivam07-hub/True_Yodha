"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FileText, Loader2, UploadCloud, ChevronDown, ChevronUp, Clock } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { StepCV } from "@/components/onboarding/step-cv"
import { jobs, scores, uploadCV, cv, users } from "@/lib/api"
import type { UserSkillItem } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

const LEVEL_COLORS: Record<number, string> = {
  0: "bg-muted text-muted-foreground",
  1: "bg-slate-100 text-slate-700",
  2: "bg-blue-100 text-blue-700",
  3: "bg-amber-100 text-amber-700",
  4: "bg-orange-100 text-orange-700",
  5: "bg-purple-100 text-purple-700",
}

function SkillEntry({ skill }: { skill: UserSkillItem }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="py-1.5 border-b border-border/50 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium leading-snug">{skill.display_name}</span>
        <span
          className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${LEVEL_COLORS[skill.level] ?? LEVEL_COLORS[0]}`}
        >
          L{skill.level}
        </span>
      </div>
      {skill.evidence_text && (
        <>
          {expanded && (
            <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed line-clamp-4">
              {skill.evidence_text}
            </p>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 flex items-center gap-0.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground"
          >
            {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            {expanded ? "less" : "why"}
          </button>
        </>
      )}
    </div>
  )
}

function DomainGroup({ domain, skills }: { domain: string; skills: UserSkillItem[] }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 hover:text-foreground"
      >
        <span className="truncate">{domain}</span>
        <span className="shrink-0 ml-1">{open ? "▲" : "▼"}</span>
      </button>
      {open && skills.map((s) => <SkillEntry key={s.key} skill={s} />)}
    </div>
  )
}

function ScoreHistory({ items }: { items: { mirror_score: number; uploaded_at: string }[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {items.slice(0, 8).map((item, i) => (
        <div key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{Math.round(item.mirror_score)}</span>
          <span className="text-[10px]">
            {new Date(item.uploaded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
          {i < items.length - 1 && i < 7 && <span className="text-border">→</span>}
        </div>
      ))}
    </div>
  )
}

export default function CVPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const { data: cvProfile, isLoading: cvLoading } = useQuery({
    queryKey: ["cv-profile", token],
    queryFn: () => cv.me(token!),
    enabled: !!token,
  })

  const { data: skillsData, isLoading: skillsLoading } = useQuery({
    queryKey: ["user-skills", token],
    queryFn: () => users.mySkills(token!),
    enabled: !!token,
  })

  async function handleUpload(file: File) {
    if (!token) return
    setUploading(true)
    setError(null)
    setMessage(null)
    try {
      const result = await uploadCV(token, file)
      await scores.compute(token)
      await jobs.compute(token).catch(() => null)
      queryClient.invalidateQueries({ queryKey: ["scores", token] })
      queryClient.invalidateQueries({ queryKey: ["jobs", token] })
      queryClient.invalidateQueries({ queryKey: ["cv-profile", token] })
      queryClient.invalidateQueries({ queryKey: ["user-skills", token] })
      setMessage(`${result.skills_detected} skills detected · Score: ${result.score}`)
      setShowUpload(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload CV")
    } finally {
      setUploading(false)
    }
  }

  if (!ready) return null

  const hasCv = !!cvProfile?.cv_raw_text
  const domainEntries = Object.entries(skillsData?.by_domain ?? {}).sort(
    ([, a], [, b]) => b.length - a.length,
  )
  const totalSkills = domainEntries.reduce((n, [, s]) => n + s.length, 0)

  return (
    <AppShell>
      <div className="flex gap-0 h-[calc(100vh-56px)] overflow-hidden">

        {/* ── Left panel: Skills (1) ─────────────────────────── */}
        <aside className="w-[22%] shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="px-3 py-3 border-b border-border">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Extracted Skills
            </p>
            {!skillsLoading && totalSkills > 0 && (
              <p className="text-xs text-foreground font-medium mt-0.5">
                {totalSkills} skills · {domainEntries.length} domains
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {skillsLoading ? (
              <p className="text-xs text-muted-foreground">Loading skills…</p>
            ) : domainEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Upload a CV to see extracted skills.
              </p>
            ) : (
              domainEntries.map(([domain, skills]) => (
                <DomainGroup key={domain} domain={domain} skills={skills} />
              ))
            )}
          </div>
        </aside>

        {/* ── Right panel: CV content (4) ─────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Header bar */}
          <div className="px-6 py-3 border-b border-border flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-semibold truncate">Your CV</span>
              {cvProfile?.history && cvProfile.history.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <ScoreHistory items={cvProfile.history} />
                </div>
              )}
            </div>
            <button
              onClick={() => setShowUpload((v) => !v)}
              className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              {hasCv ? "Replace CV" : "Upload CV"}
            </button>
          </div>

          {/* Upload panel (toggled) */}
          {(showUpload || !hasCv) && (
            <div className="px-6 py-6 border-b border-border bg-muted/30 shrink-0">
              <StepCV onNext={handleUpload} />
              {uploading && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground mt-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Reading your CV and matching to market…
                </p>
              )}
              {message && <p className="text-xs text-emerald-700 mt-3">{message}</p>}
              {error && <p className="text-xs text-destructive mt-3">{error}</p>}
            </div>
          )}

          {/* CV raw text */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {cvLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : hasCv ? (
              <>
                {cvProfile.cv_parsed_at && (
                  <p className="text-[10px] text-muted-foreground mb-4">
                    Last parsed:{" "}
                    {new Date(cvProfile.cv_parsed_at).toLocaleString("en-IN", {
                      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                )}
                <pre className="text-xs leading-relaxed whitespace-pre-wrap font-sans text-foreground/90">
                  {cvProfile.cv_raw_text}
                </pre>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
                <FileText className="w-10 h-10 opacity-20" />
                <p className="text-sm">No CV uploaded yet.</p>
                <p className="text-xs">Upload above to see extracted text here.</p>
              </div>
            )}
          </div>

        </main>
      </div>
    </AppShell>
  )
}
