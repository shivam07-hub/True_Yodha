"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Script from "next/script"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { StepCV } from "@/components/onboarding/step-cv"
import { CVUploadProcessing } from "@/components/cv/upload-processing"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { diary, jobs, scores, uploadCV, cv, users } from "@/lib/api"
import type { UserSkillItem } from "@/lib/api"
import { dataKeys, invalidateJobPathData } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

const STATUS_CONFIG = {
  strong:  { color: "var(--tm-success)", label: "Strong",  bg: "var(--tm-success-wash)" },
  exceeds: { color: "var(--tm-success)", label: "Exceeds", bg: "var(--tm-success-wash)" },
  close:   { color: "var(--tm-warning)", label: "Close",   bg: "var(--tm-warning-wash)" },
  gap:     { color: "var(--tm-warning)", label: "Gap",     bg: "var(--tm-warning-wash)" },
  missing: { color: "var(--tm-danger)",  label: "Missing", bg: "var(--tm-danger-wash)"  },
}

function levelToStatus(level: number): keyof typeof STATUS_CONFIG {
  if (level >= 4) return "strong"
  if (level === 3) return "close"
  if (level === 2) return "gap"
  return "missing"
}

const LEVEL_TITLES: Record<number, string> = {
  1: "Scout", 2: "Trailblazer", 3: "Excavator", 4: "Cartographer", 5: "Legend",
}

function extractPuterDraftText(response: unknown): string {
  if (typeof response === "string") return response.trim()
  if (!response || typeof response !== "object") return ""
  const responseRecord = response as Record<string, unknown>
  if (typeof responseRecord.message === "string") return responseRecord.message.trim()
  const message = responseRecord.message
  if (message && typeof message === "object") {
    const messageContent = (message as Record<string, unknown>).content
    if (typeof messageContent === "string") return messageContent.trim()
  }
  return ""
}

function buildPuterDraftPrompt(
  baselineText: string,
  evidence: Array<{ skill: string; task: string; proof: string; impact: string; date: string; confidence: number }>,
  versionNumber: number,
  scoreDelta: number | null,
): string {
  const evidenceBlock = evidence.map((item, index) => (
    `${index + 1}. Date: ${item.date}
Skill: ${item.skill}
Task: ${item.task || "Not provided"}
Proof: ${item.proof || "Not provided"}
Impact: ${item.impact || "Not provided"}
Confidence: ${item.confidence}`
  )).join("\n\n")
  const scoreLine = scoreDelta == null ? "Not available" : `${scoreDelta >= 0 ? "+" : ""}${scoreDelta.toFixed(1)}`

  return `You are an expert CV strategist helping a user produce CV Draft v${versionNumber}.

You must follow these rules strictly:
1. Use only facts from the baseline CV and evidence list below.
2. Do not invent employers, dates, projects, tools, metrics, or outcomes.
3. Keep the output in plain text CV format. No markdown fences.
4. Preserve strong baseline content and integrate new evidence naturally into relevant sections.
5. Add quantified outcome language only when it is present in the evidence.

Score movement since last CV: ${scoreLine}

Evidence since last CV:
${evidenceBlock || "No evidence provided"}

Baseline CV:
${baselineText}

Return only the updated CV draft text.`
}

function howToLevelUp(skillName: string, currentLevel: number): string {
  switch (currentLevel) {
    case 1: return `Apply ${skillName} in a real project that produces tangible outcomes. Freelance, volunteer, or client work all count — the key is moving beyond tutorials into something shipped. Tie it to a result: users, revenue, or a live product.`
    case 2: return `Deploy ${skillName} inside an organisation's operating lifecycle at scale. You need measurable business impact — process improved by X%, cost reduced by $Y, system serving Z users. The outcome must be quantifiable and repeatable, not just "used in a project".`
    case 3: return `Reach architect-level breadth across your entire skill cluster — not just ${skillName} in isolation. Make the architectural decisions, set the standards, and mentor others in the full domain. Coverage of adjacent skills in the same cluster is required.`
    case 4: return `Become industry-recognised. Publish, speak at conferences, or ship something notable enough that others adopt your approach to ${skillName}. You also need L4 mastery in at least two other skill clusters simultaneously.`
    default: return `You are already at the top level for ${skillName}. Maintain thought leadership: open-source contributions, publications, or standards-body involvement.`
  }
}

function cvExample(skillName: string, currentLevel: number): string {
  switch (currentLevel) {
    case 1: return `"Built a ${skillName}-powered [feature/tool] for [Project Name], which [attracted X users / generated £Y revenue / improved Z metric] within [timeframe]." — Replace the bracketed parts with your specifics. The key signal: something was shipped and someone used it.`
    case 2: return `"Led end-to-end implementation of ${skillName} across [Company]'s [system/product], reducing [metric] by X% and enabling [business outcome] for [scale, e.g. 50k+ users or £Xm revenue]." — Show ownership, scale, and a number.`
    case 3: return `"Architected the ${skillName} standards and practices adopted across [Team/Org] — defined the framework used by [N] engineers, reduced [metric] by X%, and eliminated [problem] at scale." — You own the map, not just a path through it.`
    case 4: return `"Published [research / talk / framework] on ${skillName} adopted by [N] teams industry-wide. Recognised as [award / keynote speaker / standards contributor] at [event / organisation]." — Others follow your lead.`
    default: return `You are already at the highest level. Consider contributing to open-source, publishing benchmarks, or advising standards bodies in the ${skillName} domain.`
  }
}

function SkillRow({ skill, delay = 0, highlighted }: { skill: UserSkillItem; delay?: number; highlighted: boolean }) {
  const [clickState, setClickState] = useState<0 | 1 | 2 | 3>(0)
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [pickedLevel, setPickedLevel] = useState<number | null>(null)
  const [correctionDone, setCorrectionDone] = useState(false)
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const router = useRouter()

  const statusKey = levelToStatus(skill.level)
  const cfg = STATUS_CONFIG[statusKey]
  const isMaxLevel = skill.level >= 5
  const nextLevelTitle = LEVEL_TITLES[skill.level + 1]

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (showLevelPicker) return
    setClickState((s) => (s === 3 ? 0 : (s + 1) as 0 | 1 | 2 | 3))
  }

  const trackUpgrade = useMutation({
    mutationFn: () => {
      const today = new Date().toISOString().slice(0, 10)
      return diary.saveMilestone(token!, {
        milestone_date: today,
        skill: skill.display_name,
        task: `Level up ${skill.display_name} from L${skill.level} to L${skill.level + 1}`,
        confidence: 0.6,
        completed: false,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.milestones(token) })
      router.push("/diary")
    },
  })

  const correctLevel = useMutation({
    mutationFn: (newLevel: number) => users.correctSkillLevel(token!, skill.key, newLevel),
    onSuccess: (data) => {
      setCorrectionDone(true)
      setShowLevelPicker(false)
      setPickedLevel(data.new_level)
      queryClient.invalidateQueries({ queryKey: dataKeys.userSkills(token) })
      queryClient.invalidateQueries({ queryKey: dataKeys.scores(token) })
    },
  })

  return (
    <div
      style={{
        borderRadius: "var(--tm-radius)",
        padding: "12px 14px",
        background: highlighted ? "var(--tm-accent-wash)" : clickState > 0 ? cfg.bg : "rgba(255,255,255,0.02)",
        border: highlighted
          ? "1px solid var(--tm-accent-ring)"
          : clickState > 0
          ? `1px solid ${cfg.color}`
          : "1px solid var(--tm-border-soft)",
        borderLeft: highlighted ? "2px solid var(--tm-accent)" : undefined,
        transition: "all var(--tm-dur) var(--tm-ease)",
        cursor: "pointer",
      }}
      onClick={handleClick}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: cfg.color, flexShrink: 0,
          boxShadow: `0 0 6px ${cfg.color}`,
        }} />
        <span style={{ flex: 1, fontSize: "var(--tm-fs-meta)", fontWeight: 500, color: "var(--tm-text)" }}>
          {skill.display_name}
        </span>
        {clickState === 0 && !correctionDone && (
          <span style={{ fontSize: 10, color: "var(--tm-text-faint)", letterSpacing: "0.05em" }}>
            tap to explore ↓
          </span>
        )}
        {correctionDone && pickedLevel !== null && (
          <span style={{ fontSize: 10, color: "var(--tm-success)", fontWeight: 600 }}>
            Corrected to L{pickedLevel} ✓
          </span>
        )}
        <span style={{
          fontSize: 11, padding: "2px 8px", borderRadius: 999,
          background: cfg.bg, color: cfg.color,
          border: `1px solid ${cfg.color}`, opacity: 0.9, flexShrink: 0,
        }}>
          L{correctionDone && pickedLevel !== null ? pickedLevel : skill.level} · {cfg.label}
        </span>
        {!skill.evidence_text && (
          <span style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 999, flexShrink: 0,
            background: "rgba(255,179,71,0.1)", color: "var(--tm-warning, #FFB347)",
            border: "1px solid rgba(255,179,71,0.3)", fontWeight: 600,
          }}>
            Proof weak
          </span>
        )}
      </div>

      <div style={{ height: 2, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 999,
          width: `${((correctionDone && pickedLevel !== null ? pickedLevel : skill.level) / 5) * 100}%`,
          background: "linear-gradient(90deg, var(--tm-accent), var(--tm-accent-wash))",
          transition: `width ${0.8 + delay * 0.001}s var(--tm-ease)`,
        }} />
      </div>

      {/* State 1 — CV source evidence */}
      {clickState === 1 && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 6,
          }}>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: cfg.color, fontWeight: 600 }}>
              Extracted from your CV
            </span>
            <span style={{ fontSize: 10, color: "var(--tm-text-faint)" }}>tap again to level up →</span>
          </div>
          <div style={{
            padding: "10px 12px", borderRadius: "var(--tm-radius-sm)",
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${cfg.color}30`,
            fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.7,
            fontStyle: "italic",
          }}>
            {skill.evidence_text
              ? `"${skill.evidence_text}"`
              : `No direct quote captured — ${skill.display_name} was inferred from the overall context of your CV.`}
          </div>
        </div>
      )}

      {/* State 2 — How to reach next level + Journey 2 + Journey 3 */}
      {clickState === 2 && (
        <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 6,
          }}>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: cfg.color, fontWeight: 600 }}>
              {isMaxLevel ? "Max Level" : `How to reach ${nextLevelTitle} (L${skill.level + 1})`}
            </span>
            <span
              style={{ fontSize: 10, color: "var(--tm-text-faint)", cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); setClickState(3) }}
            >
              tap again for CV example →
            </span>
          </div>
          <div style={{
            padding: "10px 12px", borderRadius: "var(--tm-radius-sm)",
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${cfg.color}30`,
            fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.7,
            marginBottom: 10,
          }}>
            {howToLevelUp(skill.display_name, skill.level)}
          </div>

          {/* Journey 2 + Journey 3 CTAs */}
          {!isMaxLevel && !showLevelPicker && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); trackUpgrade.mutate() }}
                disabled={trackUpgrade.isPending}
                className="tm-btn tm-btn-primary"
                style={{ fontSize: 11, height: 30, padding: "0 12px", whiteSpace: "nowrap" }}
              >
                {trackUpgrade.isPending ? "Saving…" : `Track upgrade in diary →`}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowLevelPicker(true) }}
                className="tm-btn tm-btn-ghost"
                style={{ fontSize: 11, height: 30, padding: "0 12px", whiteSpace: "nowrap" }}
              >
                Fix my level
              </button>
            </div>
          )}

          {/* Journey 3 — inline level picker */}
          {showLevelPicker && (
            <div
              style={{
                marginTop: 8, padding: "10px 12px", borderRadius: "var(--tm-radius-sm)",
                border: "1px solid var(--tm-border)", background: "var(--tm-surface-2)",
                display: "flex", flexDirection: "column", gap: 8,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 11, color: "var(--tm-text-muted)", fontWeight: 600 }}>
                My actual level for {skill.display_name}:
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPickedLevel(lvl) }}
                    style={{
                      width: 36, height: 36, borderRadius: "var(--tm-radius-sm)",
                      border: pickedLevel === lvl ? "2px solid var(--tm-accent)" : "1px solid var(--tm-border)",
                      background: pickedLevel === lvl ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)",
                      color: pickedLevel === lvl ? "var(--tm-accent)" : "var(--tm-text-faint)",
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all var(--tm-dur) var(--tm-ease)",
                    }}
                  >
                    L{lvl}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (pickedLevel) correctLevel.mutate(pickedLevel) }}
                  disabled={!pickedLevel || correctLevel.isPending}
                  className="tm-btn tm-btn-primary"
                  style={{ fontSize: 11, height: 30, padding: "0 12px", opacity: !pickedLevel ? 0.5 : 1 }}
                >
                  {correctLevel.isPending ? "Saving…" : "Confirm correction"}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowLevelPicker(false); setPickedLevel(null) }}
                  className="tm-btn tm-btn-ghost"
                  style={{ fontSize: 11, height: 30, padding: "0 12px" }}
                >
                  Cancel
                </button>
              </div>
              {correctLevel.isError && (
                <div style={{ fontSize: 11, color: "var(--tm-danger)" }}>Could not save correction. Try again.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* State 3 — CV example bullet */}
      {clickState === 3 && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 6,
          }}>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", fontWeight: 600 }}>
              CV bullet · L{skill.level + 1} signal
            </span>
            <span style={{ fontSize: 10, color: "var(--tm-text-faint)" }}>tap again to close ↺</span>
          </div>
          <div style={{
            padding: "10px 12px", borderRadius: "var(--tm-radius-sm)",
            background: "var(--tm-accent-wash)",
            border: "1px solid var(--tm-accent-ring)",
            fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.7,
            fontStyle: "italic",
          }}>
            {cvExample(skill.display_name, skill.level)}
          </div>
        </div>
      )}
    </div>
  )
}

function ClusterSection({ cluster, skills, highlighted }: { cluster: string; skills: UserSkillItem[]; highlighted: string | null }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="tm-label-caps" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <span>{cluster}</span>
        <span style={{ fontSize: 10, color: "var(--tm-text-faint)" }}>{skills.length} skills</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {skills.map((s, i) => (
          <SkillRow
            key={s.key}
            skill={s}
            delay={i * 60}
            highlighted={highlighted ? s.display_name.toLowerCase().includes(highlighted.toLowerCase()) : false}
          />
        ))}
      </div>
    </div>
  )
}

function SkillAuditView({ allSkills }: { allSkills: UserSkillItem[] }) {
  const weak = allSkills.filter(s => !s.evidence_text)
  const strong = allSkills.filter(s => !!s.evidence_text)
  const LEVEL_LABEL = ["", "Awareness", "Working", "Practitioner", "Expert", "Authority"]
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {weak.length > 0 && (
        <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-warning, #FFB347)", marginBottom: 6, marginTop: 4 }}>
          Proof weak · {weak.length} skills — keyword-inferred only
        </div>
      )}
      {weak.map(s => (
        <div key={s.key} style={{ display: "grid", gridTemplateColumns: "1fr 60px auto", gap: 10, padding: "7px 10px", borderRadius: "var(--tm-radius-sm)", background: "rgba(255,179,71,0.04)", border: "1px solid rgba(255,179,71,0.15)", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "var(--tm-text)" }}>{s.display_name}</div>
          <div style={{ fontSize: 11, fontFamily: "var(--tm-font-mono)", color: "var(--tm-text-faint)" }}>L{s.level} · {LEVEL_LABEL[s.level]}</div>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(255,179,71,0.1)", color: "var(--tm-warning, #FFB347)", border: "1px solid rgba(255,179,71,0.3)", whiteSpace: "nowrap" }}>Proof weak</span>
        </div>
      ))}
      {strong.length > 0 && (
        <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-success)", marginTop: 14, marginBottom: 6 }}>
          Proof logged · {strong.length} skills
        </div>
      )}
      {strong.map(s => (
        <div key={s.key} style={{ display: "grid", gridTemplateColumns: "1fr 60px 1fr", gap: 10, padding: "7px 10px", borderRadius: "var(--tm-radius-sm)", background: "rgba(74,222,128,0.03)", border: "1px solid rgba(74,222,128,0.1)", alignItems: "start" }}>
          <div style={{ fontSize: 12, color: "var(--tm-text)" }}>{s.display_name}</div>
          <div style={{ fontSize: 11, fontFamily: "var(--tm-font-mono)", color: "var(--tm-text-faint)", paddingTop: 1 }}>L{s.level} · {LEVEL_LABEL[s.level]}</div>
          <div style={{ fontSize: 11, color: "var(--tm-text-faint)", lineHeight: 1.5, fontStyle: "italic" }}>&quot;{s.evidence_text?.slice(0, 80)}{(s.evidence_text?.length ?? 0) > 80 ? "…" : ""}&quot;</div>
        </div>
      ))}
      {allSkills.length === 0 && (
        <div style={{ padding: "24px", textAlign: "center", color: "var(--tm-text-faint)", fontSize: 13 }}>Upload a CV to see skill audit</div>
      )}
    </div>
  )
}

export default function CVPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ skills_detected: number; score: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showDraftGuide, setShowDraftGuide] = useState(false)
  const [draftStage, setDraftStage] = useState<"guide" | "generating" | "review">("guide")
  const [draftText, setDraftText] = useState("")
  const [draftFlowError, setDraftFlowError] = useState<string | null>(null)
  const [isGeneratingWithPuter, setIsGeneratingWithPuter] = useState(false)
  const [isPuterReady, setIsPuterReady] = useState(false)
  const [isPuterSignedIn, setIsPuterSignedIn] = useState<boolean | null>(null)
  const [catFilter, setCatFilter] = useState<"all" | "technical" | "domain" | "soft" | "skill-audit">("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "strong" | "gap" | "critical">("all")
  const [highlightedSkill] = useState<string | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobCvText, setJobCvText] = useState<string | null>(null)
  const [jobCvNotice, setJobCvNotice] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    setJobId(new URLSearchParams(window.location.search).get("jobId"))
  }, [])

  const { data: cvProfile, isLoading: cvLoading } = useQuery({
    queryKey: dataKeys.cvProfile(token),
    queryFn: () => cv.me(token!),
    enabled: !!token,
  })

  const { data: skillsData, isLoading: skillsLoading } = useQuery({
    queryKey: dataKeys.userSkills(token),
    queryFn: () => users.mySkills(token!),
    enabled: !!token,
  })

  const { data: scoreData } = useQuery({
    queryKey: dataKeys.scores(token),
    queryFn: () => scores.me(token!),
    enabled: !!token,
  })

  const jobPathQuery = useQuery({
    queryKey: dataKeys.jobPath(jobId, token),
    queryFn: () => jobs.path(token!, jobId!),
    enabled: !!token && !!jobId,
  })

  const hasCv = !!cvProfile?.cv_raw_text || (cvProfile?.history?.length ?? 0) > 0

  const { data: evidenceData, isLoading: evidenceLoading } = useQuery({
    queryKey: dataKeys.cvEvidence(token),
    queryFn: () => cv.evidence(token!),
    enabled: !!token && hasCv,
  })

  const saveGeneratedDraft = useMutation({
    mutationFn: (nextDraftText: string) => cv.saveDraft(token!, nextDraftText),
    onMutate: () => {
      setError(null)
      setMessage(null)
      setDraftFlowError(null)
    },
    onSuccess: (draft) => {
      queryClient.invalidateQueries({ queryKey: dataKeys.cvProfile(token) })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvEvidence(token) })
      setMessage(`Saved CV draft v${draft.version_number} from ${draft.evidence_count} milestone days.`)
      setSelectedVersionId(draft.version_id)
      setShowDraftGuide(false)
      setDraftStage("guide")
      setDraftText("")
    },
    onError: (err) => setDraftFlowError(err instanceof Error ? err.message : "Could not save CV draft"),
  })

  const generateJobCv = useMutation({
    mutationFn: ({ aiPolish }: { aiPolish: boolean }) => jobs.generateJobCv(token!, jobId!, aiPolish),
    onSuccess: (result, variables) => {
      setJobCvText(result.polished_text ?? result.cv_text)
      if (variables.aiPolish && result.limit_reached) {
        setJobCvNotice("AI polish limit reached. Showing the best cached job CV.")
      } else if (variables.aiPolish && result.polish_unavailable) {
        setJobCvNotice("Polish unavailable, using the proof-backed CV.")
      } else if (variables.aiPolish && result.polished_text) {
        const remaining = Math.max(0, result.ai_polish_limit - result.ai_polish_used)
        setJobCvNotice(`Polished CV ready. ${remaining} polish calls left today.`)
      } else {
        setJobCvNotice("Job CV ready.")
      }
      invalidateJobPathData(queryClient, jobId, token)
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not generate job CV"),
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!window.puter) return
    setIsPuterReady(true)
    try {
      setIsPuterSignedIn(window.puter.auth.isSignedIn())
    } catch {
      setIsPuterSignedIn(null)
    }
  }, [showDraftGuide])

  function resetDraftFlow() {
    setDraftStage("guide")
    setDraftText("")
    setDraftFlowError(null)
  }

  async function handleGenerateWithPuter() {
    if (!token) return
    if (!evidenceData?.eligible) {
      setDraftFlowError(`Complete ${evidenceData?.required_count ?? 7} milestone days before generating the next draft.`)
      return
    }
    const baselineText = (cvProfile?.cv_raw_text ?? "").trim()
    if (!baselineText) {
      setDraftFlowError("Upload a baseline CV first.")
      return
    }
    if (!window.puter) {
      setDraftFlowError("Puter did not load yet. Please wait a moment and try again.")
      return
    }

    setIsGeneratingWithPuter(true)
    setDraftFlowError(null)
    setDraftStage("generating")

    try {
      if (!window.puter.auth.isSignedIn()) {
        await window.puter.auth.signIn()
      }
      setIsPuterSignedIn(true)
      const prompt = buildPuterDraftPrompt(
        baselineText,
        evidenceData.evidence,
        evidenceData.next_version_number,
        evidenceData.score_delta,
      )
      const response = await window.puter.ai.chat(prompt, { model: "openai/gpt-4.1" })
      const nextDraftText = extractPuterDraftText(response)
      if (!nextDraftText) {
        throw new Error("Puter returned an empty draft. Please retry.")
      }
      setDraftText(nextDraftText)
      setDraftStage("review")
    } catch (err) {
      setDraftStage("guide")
      setDraftFlowError(err instanceof Error ? err.message : "Could not generate draft through Puter.")
    } finally {
      setIsGeneratingWithPuter(false)
    }
  }

  async function handleUpload(file: File) {
    if (!token) return
    setUploading(true)
    setUploadResult(null)
    setError(null)
    setMessage(null)
    try {
      const result = await uploadCV(token, file)
      // Score is already computed and persisted inside cv_workflow.ingest_uploaded_cv —
      // no separate scores.compute call needed here.
      void jobs.compute(token)
        .then(() => queryClient.invalidateQueries({ queryKey: dataKeys.jobs(token) }))
        .catch(() => null)
      // Force-refetch CV profile before the modal closes so the text viewer
      // shows the new CV immediately (invalidateQueries alone only marks stale).
      await queryClient.refetchQueries({ queryKey: dataKeys.cvProfile(token) })
      queryClient.invalidateQueries({ queryKey: dataKeys.scores(token) })
      queryClient.invalidateQueries({ queryKey: dataKeys.jobs(token) })
      queryClient.invalidateQueries({ queryKey: dataKeys.cvEvidence(token) })
      queryClient.invalidateQueries({ queryKey: dataKeys.userSkills(token) })
      setUploadResult({ skills_detected: result.skills_detected as number, score: result.score as number })
      setMessage(`${result.skills_detected} skills detected · Score: ${result.score}`)
      setSelectedVersionId(null)
      // Show success state briefly before closing
      setTimeout(() => {
        setShowUpload(false)
        setUploadResult(null)
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload CV")
    } finally {
      setUploading(false)
    }
  }

  if (!ready) return null

  const domainKeywords: Record<string, string[]> = {
    technical: ["engineering", "programming", "software", "data", "cloud", "devops", "infrastructure", "database", "api", "security", "systems", "network", "code"],
    domain:    ["finance", "analytics", "product", "strategy", "business", "marketing", "operations", "management", "research", "science"],
    soft:      ["communication", "leadership", "collaboration", "soft", "interpersonal", "teamwork", "presentation", "writing", "people"],
  }

  const allClusterEntries = Object.entries(skillsData?.by_cluster ?? {}).sort(([, a], [, b]) => b.length - a.length)
  const clusterEntries = catFilter === "all"
    ? allClusterEntries
    : (() => {
        const domainEntries = Object.entries(skillsData?.by_domain ?? {})
        if (domainEntries.length > 0) {
          const keywords = domainKeywords[catFilter] ?? []
          const matchingDomain = domainEntries
            .filter(([domain]) => keywords.some((kw) => domain.toLowerCase().includes(kw)))
          if (matchingDomain.length > 0) {
            return matchingDomain.sort(([, a], [, b]) => b.length - a.length)
          }
        }
        const keywords = domainKeywords[catFilter] ?? []
        return allClusterEntries.filter(([cluster]) =>
          keywords.some((kw) => cluster.toLowerCase().includes(kw))
        )
      })()

  const totalSkills = allClusterEntries.reduce((n, [, s]) => n + s.length, 0)

  function matchesStatus(level: number): boolean {
    if (statusFilter === "strong")   return level >= 4
    if (statusFilter === "gap")      return level >= 2 && level < 4
    if (statusFilter === "critical") return level < 2
    return true
  }

  const filteredClusterEntries = statusFilter === "all"
    ? clusterEntries
    : clusterEntries
        .map(([cluster, skills]) => [cluster, skills.filter((s) => matchesStatus(s.level))] as [string, typeof skills])
        .filter(([, skills]) => skills.length > 0)

  const counts = clusterEntries.reduce((acc, [, skills]) => {
    skills.forEach((s) => {
      if (s.level >= 4) acc.strong++
      else if (s.level >= 2) acc.gap++
      else acc.critical++
    })
    return acc
  }, { strong: 0, gap: 0, critical: 0 })

  // Determine text to show in viewer
  const selectedVersion = selectedVersionId !== null
    ? cvProfile?.history?.find((v) => v.id === selectedVersionId) ?? null
    : null
  const displayText = selectedVersion?.cv_raw_text ?? cvProfile?.cv_raw_text ?? null

  return (
    <AppShell>
      <Script
        src="https://js.puter.com/v2/"
        strategy="afterInteractive"
        onLoad={() => {
          setIsPuterReady(true)
          if (window.puter) {
            try {
              setIsPuterSignedIn(window.puter.auth.isSignedIn())
            } catch {
              setIsPuterSignedIn(null)
            }
          }
        }}
      />
      <div className="tm-page-enter" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "24px 32px 16px", flexShrink: 0 }}>
          <div className="tm-label-caps" style={{ marginBottom: 6 }}>app/CV_Builder</div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h1 className="tm-title" style={{ marginBottom: 3, fontSize: "var(--tm-fs-heading)" }}>Build your next CV from proof</h1>
              <p className="tm-meta" style={{ fontSize: 12 }}>
                {hasCv ? "Baseline saved · progress evidence becomes the next draft" : "Upload your baseline once to start"}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {hasCv ? (
                <>
                  <button
                    onClick={() => {
                      resetDraftFlow()
                      setShowDraftGuide(true)
                    }}
                    disabled={isGeneratingWithPuter || saveGeneratedDraft.isPending}
                    className="tm-btn tm-btn-primary"
                    style={{
                      height: 36,
                      fontSize: "var(--tm-fs-meta)",
                      opacity: isGeneratingWithPuter || saveGeneratedDraft.isPending ? 0.7 : 1,
                    }}
                  >
                    {saveGeneratedDraft.isPending ? "Saving..." : isGeneratingWithPuter ? "Generating..." : "Generate Next CV Draft"}
                  </button>
                  <button
                    onClick={() => setShowUpload((v) => !v)}
                    className="tm-btn tm-btn-ghost"
                    style={{ height: 36, fontSize: 12 }}
                  >
                    Rework CV Baseline
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowUpload((v) => !v)}
                  className="tm-btn tm-btn-primary"
                  style={{ height: 36, fontSize: "var(--tm-fs-meta)" }}
                >
                  Upload baseline CV
                </button>
              )}
            </div>
          </div>
          {(message || error) && (
            <div role={error ? "alert" : "status"} style={{ marginTop: 8, fontSize: 12, color: error ? "var(--tm-danger)" : "var(--tm-accent)" }}>
              {error ?? message}
            </div>
          )}

          {/* Summary stats */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
            {[
              { label: "Strong",   key: "strong",   count: counts.strong,   color: "var(--tm-success)", wash: "var(--tm-success-wash)" },
              { label: "Gaps",     key: "gap",      count: counts.gap,       color: "var(--tm-warning)", wash: "var(--tm-warning-wash)" },
              { label: "Critical", key: "critical", count: counts.critical,  color: "var(--tm-danger)",  wash: "var(--tm-danger-wash)"  },
            ].map(({ label, key, count, color, wash }) => {
              const active = statusFilter === key
              return (
                <button
                  key={label}
                  onClick={() => setStatusFilter(active ? "all" : key as typeof statusFilter)}
                  style={{
                    padding: "6px 14px", borderRadius: "var(--tm-radius-sm)",
                    background: active ? color : wash,
                    border: `1px solid ${color}`,
                    display: "flex", alignItems: "center", gap: 8,
                    cursor: "pointer", fontFamily: "inherit",
                    boxShadow: active ? `0 0 10px ${color}40` : "none",
                    transition: "all var(--tm-dur) var(--tm-ease)",
                    outline: "none",
                  }}
                >
                  <span style={{ fontSize: "var(--tm-fs-body)", fontWeight: 700, color: active ? "var(--tm-bg)" : color, lineHeight: 1 }}>{count}</span>
                  <span style={{ fontSize: 12, color: active ? "var(--tm-bg)" : "inherit" }}>{label}</span>
                </button>
              )
            })}
            {scoreData && (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--tm-text-muted)" }}>Myro Score:</span>
                <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: "var(--tm-fs-body)", fontWeight: 600, color: "var(--tm-text)" }}>
                  {Math.round(scoreData.total_score)}
                </span>
                <span style={{ fontSize: 12, color: "var(--tm-text-muted)" }}>/100 · {totalSkills} skills</span>
              </div>
            )}
          </div>

        </div>

        {jobId && (
          <section style={{
            margin: "0 32px 16px",
            padding: "14px 16px",
            borderRadius: "var(--tm-radius)",
            border: "1px solid var(--tm-border-soft)",
            background: "var(--tm-surface)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div className="tm-label-caps" style={{ marginBottom: 4, color: "var(--tm-accent)" }}>Job CV</div>
                <div style={{ fontSize: "var(--tm-fs-heading)", color: "var(--tm-text)", fontWeight: 600 }}>
                  {jobPathQuery.data?.job_title ?? "Tracked job"}
                </div>
                <div style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
                  {jobPathQuery.data?.company ?? ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => generateJobCv.mutate({ aiPolish: false })}
                  disabled={generateJobCv.isPending}
                  className="tm-btn tm-btn-primary"
                  style={{ height: 36, fontSize: "var(--tm-fs-meta)", whiteSpace: "nowrap" }}
                >
                  {generateJobCv.isPending ? "Generating..." : "Generate job CV"}
                </button>
                <button
                  type="button"
                  onClick={() => generateJobCv.mutate({ aiPolish: true })}
                  disabled={generateJobCv.isPending}
                  className="tm-btn tm-btn-ghost"
                  style={{ height: 36, fontSize: "var(--tm-fs-meta)", whiteSpace: "nowrap" }}
                >
                  AI polish
                </button>
              </div>
            </div>
            {jobPathQuery.data && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="tm-pill">{jobPathQuery.data.readiness_pct}% ready</span>
                <span className="tm-pill">{String(jobPathQuery.data.cv?.confidence?.badge_text ?? "Starter")}</span>
              </div>
            )}
            {jobCvNotice && (
              <div style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
                {jobCvNotice}
              </div>
            )}
            {jobCvText && (
              <pre style={{
                maxHeight: 220,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                fontFamily: "var(--tm-font-mono)",
                fontSize: "var(--tm-fs-meta)",
                lineHeight: "var(--tm-lh-meta)",
                color: "var(--tm-text-muted)",
                border: "1px solid var(--tm-border-soft)",
                borderRadius: "var(--tm-radius-sm)",
                padding: 12,
                background: "rgba(255,255,255,0.02)",
              }}>
                {jobCvText}
              </pre>
            )}
          </section>
        )}

        {/* Split body */}
        <div style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          overflow: "hidden",
          borderTop: "1px solid var(--tm-border-soft)",
        }}>
          {/* LEFT — Skill mapping */}
          <div style={{ overflowY: "auto", padding: "16px 20px 24px 32px", borderRight: "1px solid var(--tm-border-soft)" }}>
            <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" }}>
              {(["all", "technical", "domain", "soft", "skill-audit"] as const).map((c) => (
                <button key={c} onClick={() => setCatFilter(c)} style={{
                  padding: "5px 12px", borderRadius: 999,
                  fontSize: "var(--tm-fs-meta)", fontWeight: 500,
                  background: catFilter === c ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${catFilter === c ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                  color: catFilter === c ? "var(--tm-accent)" : "var(--tm-text-muted)",
                  cursor: "pointer", textTransform: "capitalize",
                  transition: "all var(--tm-dur) var(--tm-ease)",
                  fontFamily: "inherit",
                }}>{c === "skill-audit" ? "◈ Skill Audit" : c}</button>
              ))}
            </div>

            {skillsLoading ? (
              <div style={{ color: "var(--tm-text-faint)", fontSize: "var(--tm-fs-meta)", padding: "32px 0", textAlign: "center" }}>
                Loading skills…
              </div>
            ) : catFilter === "skill-audit" ? (
              <SkillAuditView allSkills={Object.values(skillsData?.by_cluster ?? {}).flat()} />
            ) : filteredClusterEntries.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--tm-text-faint)", fontSize: "var(--tm-fs-meta)" }}>
                <div style={{ fontSize: 33, marginBottom: 12, opacity: 0.3 }}>◈</div>
                {clusterEntries.length === 0 ? "Upload a CV to see extracted skills" : `No ${statusFilter} skills in this view`}
              </div>
            ) : (
              filteredClusterEntries.map(([cluster, skills]) => (
                <ClusterSection
                  key={cluster}
                  cluster={cluster}
                  skills={skills}
                  highlighted={highlightedSkill}
                />
              ))
            )}
          </div>

          {/* RIGHT — Version history + CV viewer */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {hasCv && (
              <section style={{
                padding: "14px 20px 12px",
                borderBottom: "1px solid var(--tm-border-soft)",
                flexShrink: 0,
                background: "rgba(255,255,255,0.02)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                  <div className="tm-label-caps">Evidence Since Last CV</div>
                  <span style={{
                    fontSize: 10, color: evidenceData?.eligible ? "var(--tm-accent)" : "var(--tm-text-faint)",
                    background: evidenceData?.eligible ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.04)",
                    padding: "2px 8px", borderRadius: 999,
                    border: `1px solid ${evidenceData?.eligible ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                  }}>
                    {evidenceData?.evidence_count ?? 0}/{evidenceData?.required_count ?? 7} days
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, marginBottom: 10 }}>
                  {[
                    { label: "Milestone days", value: evidenceData?.evidence_count ?? 0 },
                    { label: "Diary entries", value: evidenceData?.diary_entries_count ?? 0 },
                    { label: "Skill upgrades", value: evidenceData?.skill_upgrades_count ?? 0 },
                    { label: "Score move", value: evidenceData?.score_delta == null ? "0" : `${evidenceData.score_delta >= 0 ? "+" : ""}${Math.round(evidenceData.score_delta)}` },
                  ].map((item) => (
                    <div key={item.label} style={{ padding: "8px 10px", borderRadius: "var(--tm-radius-sm)", border: "1px solid var(--tm-border-soft)", background: "rgba(255,255,255,0.02)" }}>
                      <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 16, color: "var(--tm-text)", fontWeight: 700 }}>{item.value}</div>
                      <div style={{ fontSize: 10, color: "var(--tm-text-faint)", marginTop: 2 }}>{item.label}</div>
                    </div>
                  ))}
                </div>
                {evidenceLoading ? (
                  <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>Loading evidence...</div>
                ) : evidenceData?.evidence.length ? (
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                    {evidenceData.evidence.slice(-7).map((item) => (
                      <div key={`${item.date}-${item.skill}-${item.task}`} style={{
                        flexShrink: 0, width: 180,
                        padding: "8px 10px", borderRadius: "var(--tm-radius-sm)",
                        border: "1px solid var(--tm-border-soft)", background: "var(--tm-surface)",
                      }}>
                        <div style={{ fontSize: 11, color: "var(--tm-accent)", fontWeight: 600, marginBottom: 3 }}>{item.skill}</div>
                        <div style={{ fontSize: 11, color: "var(--tm-text-muted)", lineHeight: 1.45, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.task}</div>
                        <div style={{ fontSize: 10, color: "var(--tm-text-faint)", marginTop: 4 }}>{new Date(item.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>
                    Complete milestone days in Progress to unlock the next draft.
                  </div>
                )}
                {!!evidenceData?.missing_detail_prompts.length && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--tm-warning)" }}>
                    {evidenceData.missing_detail_prompts[0]}
                  </div>
                )}
              </section>
            )}

            {/* Version timeline */}
            <div style={{
              padding: "14px 20px 12px",
              borderBottom: "1px solid var(--tm-border-soft)",
              flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: cvProfile?.history?.length ? 10 : 0 }}>
                <div className="tm-label-caps">CV Versions</div>
                {!!cvProfile?.history?.length && (
                  <span style={{
                    fontSize: 10, color: "var(--tm-text-faint)",
                    background: "rgba(255,255,255,0.04)", padding: "1px 7px",
                    borderRadius: 999, border: "1px solid var(--tm-border-soft)",
                  }}>
                    {cvProfile.history.length}
                  </span>
                )}
              </div>

              {!!cvProfile?.history?.length && (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {/* Root node */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--tm-accent)", flexShrink: 0, boxShadow: "0 0 6px var(--tm-accent-glow)" }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--tm-accent)", fontFamily: "var(--tm-font-mono)" }}>📄 Base CV</span>
                  </div>
                  {cvProfile.history.map((v, i) => {
                    const isLatest = i === 0
                    const isSelected = selectedVersionId === v.id || (selectedVersionId === null && isLatest)
                    const prev = cvProfile.history[i + 1]
                    const delta = prev ? Math.round(v.mirror_score - prev.mirror_score) : null
                    const isLast = i === cvProfile.history.length - 1
                    return (
                      <div key={v.id} style={{ display: "flex", gap: 0 }}>
                        {/* Tree connector */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 16, flexShrink: 0 }}>
                          <div style={{ width: 1, flex: 1, background: isLast ? "transparent" : "var(--tm-border-soft)", minHeight: 8 }} />
                          <div style={{ width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${isSelected ? "var(--tm-accent)" : "var(--tm-border-soft)"}`, background: isSelected ? "var(--tm-accent-wash)" : "transparent", flexShrink: 0 }} />
                          <div style={{ width: 1, flex: 1, background: isLast ? "transparent" : "var(--tm-border-soft)", minHeight: 8 }} />
                        </div>
                        <button
                          onClick={() => setSelectedVersionId(isLatest ? null : v.id)}
                          style={{
                            flex: 1, padding: "5px 8px", margin: "2px 0",
                            borderRadius: "var(--tm-radius-sm)",
                            background: isSelected ? "var(--tm-accent-wash)" : "transparent",
                            border: `1px solid ${isSelected ? "var(--tm-accent-ring)" : "transparent"}`,
                            cursor: "pointer", fontFamily: "inherit",
                            textAlign: "left", transition: "all var(--tm-dur) var(--tm-ease)",
                          }}
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.03)" }}
                          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 11, fontFamily: "var(--tm-font-mono)", fontWeight: 600, color: isSelected ? "var(--tm-accent)" : "var(--tm-text-muted)" }}>
                              v{v.version_number}
                            </span>
                            {isLatest && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 999, background: "var(--tm-accent)", color: "var(--tm-bg)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>HEAD</span>}
                            {delta !== null && <span style={{ fontSize: 9, fontWeight: 700, color: delta >= 0 ? "var(--tm-success)" : "var(--tm-danger)" }}>{delta >= 0 ? `+${delta}` : delta}</span>}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--tm-text-faint)" }}>
                            {v.version_type === "generated_draft" ? "generated draft" : "baseline"} · {new Date(v.uploaded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* CV text viewer */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 32px 20px", position: "relative" }}>
              <div style={{
                position: "absolute", right: 24, top: 20,
                fontSize: 81, color: "var(--tm-accent-wash)",
                pointerEvents: "none", userSelect: "none", lineHeight: 1,
              }}>◈</div>

              {cvLoading ? (
                <p style={{ color: "var(--tm-text-faint)", fontSize: "var(--tm-fs-meta)" }}>Loading…</p>
              ) : displayText ? (
                <pre style={{
                  fontSize: 12.5, lineHeight: 1.8, color: "var(--tm-text-muted)",
                  fontFamily: "var(--tm-font-mono)", whiteSpace: "pre-wrap",
                  wordBreak: "break-word", position: "relative",
                }}>
                  {displayText.split("\n").map((line, i) => {
                    const isHighlighted = !!highlightedSkill && line.toLowerCase().includes(highlightedSkill.toLowerCase().split(" ")[0])
                    return (
                      <span key={i} style={{
                        display: "block",
                        background: isHighlighted ? "var(--tm-accent-wash)" : "transparent",
                        borderLeft: isHighlighted ? "2px solid var(--tm-accent)" : "2px solid transparent",
                        paddingLeft: 6, borderRadius: 2,
                        transition: "all var(--tm-dur)",
                        color: line.startsWith("─") ? "var(--tm-accent-wash)"
                          : (line.match(/^[A-Z ]+$/) && line.length > 3) ? "var(--tm-text)"
                          : "var(--tm-text-muted)",
                        fontWeight: (line.match(/^[A-Z ]+$/) && line.length > 3) ? 600 : 400,
                      }}>
                        {line || " "}
                      </span>
                    )
                  })}
                </pre>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--tm-text-faint)", textAlign: "center", gap: 12 }}>
                  <div style={{ fontSize: 49, opacity: 0.2 }}>◈</div>
                  <p style={{ fontSize: "var(--tm-fs-meta)" }}>No CV uploaded yet.</p>
                  <p style={{ fontSize: 12 }}>Use the button above to upload.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={showDraftGuide}
        onOpenChange={(open) => {
          setShowDraftGuide(open)
          if (!open) resetDraftFlow()
        }}
      >
        <DialogContent className="max-w-3xl p-0" showCloseButton={false}>
          <div style={{ padding: 24 }}>
            <DialogHeader>
              <div className="tm-label-caps" style={{ marginBottom: 6 }}>Next CV Draft</div>
              <DialogTitle style={{ fontSize: "var(--tm-fs-heading)", color: "var(--tm-text)" }}>
                {draftStage === "review" ? "Review your generated draft" : "Login through OpenAI to generate new draft"}
              </DialogTitle>
              <DialogDescription style={{ fontSize: 12, lineHeight: 1.7, color: "var(--tm-text-muted)" }}>
                {draftStage === "review"
                  ? "Review the draft text below. You can edit it before saving as a new CV version."
                  : evidenceLoading
                  ? "Checking your progress evidence before generation."
                  : evidenceData?.eligible
                  ? `Ready for v${evidenceData.next_version_number}: ${evidenceData.evidence_count} milestone days recorded.`
                  : `${evidenceData?.evidence_count ?? 0}/${evidenceData?.required_count ?? 7} milestone days recorded before the next draft unlocks.`}
              </DialogDescription>
            </DialogHeader>

            {draftStage === "generating" && (
              <div
                style={{
                  marginTop: 16,
                  borderRadius: "var(--tm-radius-sm)",
                  border: "1px solid var(--tm-accent-ring)",
                  background: "var(--tm-accent-wash)",
                  padding: "12px 14px",
                  fontSize: 12,
                  color: "var(--tm-text)",
                  lineHeight: 1.6,
                }}
              >
                Generating your draft in-browser with Puter and OpenAI. Please keep this window open.
              </div>
            )}

            {draftStage !== "review" && draftStage !== "generating" && (
              <div
                style={{
                  marginTop: 16,
                  borderRadius: "var(--tm-radius-sm)",
                  border: "1px solid var(--tm-border-soft)",
                  background: "rgba(255,255,255,0.03)",
                  padding: "12px 14px",
                  fontSize: 12,
                  color: "var(--tm-text-muted)",
                  lineHeight: 1.6,
                }}
              >
                This action uses your Puter account. Click Continue to sign in through OpenAI and generate the draft directly in your browser.
              </div>
            )}

            {draftStage === "review" && (
              <div style={{ marginTop: 16 }}>
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: 360,
                    resize: "vertical",
                    borderRadius: "var(--tm-radius-sm)",
                    border: "1px solid var(--tm-border-soft)",
                    background: "rgba(255,255,255,0.02)",
                    color: "var(--tm-text)",
                    padding: "12px 14px",
                    fontSize: 12,
                    lineHeight: 1.7,
                    fontFamily: "var(--tm-font-mono)",
                  }}
                />
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--tm-text-faint)" }}>
                  Save will create `generated_draft` version v{evidenceData?.next_version_number ?? "next"} in `cv_history`.
                </div>
              </div>
            )}

            {(draftFlowError || error) && (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--tm-danger)" }}>
                {draftFlowError ?? error}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              padding: 16,
              borderTop: "1px solid var(--tm-border-soft)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <button
              onClick={() => setShowDraftGuide(false)}
              className="tm-btn tm-btn-ghost"
              style={{ height: 36, fontSize: 12 }}
            >
              Close
            </button>
            {draftStage === "guide" && (
              <button
                onClick={handleGenerateWithPuter}
                disabled={!isPuterReady || !evidenceData?.eligible || isGeneratingWithPuter}
                className="tm-btn tm-btn-primary"
                style={{
                  height: 36,
                  fontSize: "var(--tm-fs-meta)",
                  opacity: !isPuterReady || !evidenceData?.eligible || isGeneratingWithPuter ? 0.55 : 1,
                }}
              >
                {isGeneratingWithPuter
                  ? "Generating..."
                  : isPuterSignedIn
                  ? "Continue with OpenAI"
                  : "Continue and Login"}
              </button>
            )}
            {draftStage === "review" && (
              <button
                onClick={() => saveGeneratedDraft.mutate(draftText)}
                disabled={saveGeneratedDraft.isPending || draftText.trim().length < 120}
                className="tm-btn tm-btn-primary"
                style={{
                  height: 36,
                  fontSize: "var(--tm-fs-meta)",
                  opacity: saveGeneratedDraft.isPending || draftText.trim().length < 120 ? 0.55 : 1,
                }}
              >
                {saveGeneratedDraft.isPending ? "Saving..." : "Save as CV version"}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload modal overlay */}
      {showUpload && (
        <div
          onClick={() => { if (!uploading && !uploadResult) setShowUpload(false) }}
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 560,
              borderRadius: "var(--tm-radius)",
              background: "var(--tm-surface)",
              border: "1px solid var(--tm-accent-ring)",
              boxShadow: "0 0 48px var(--tm-accent-glow), 0 24px 64px rgba(0,0,0,0.6)",
              position: "relative",
              padding: 28,
            }}
          >
            {/* Close — hidden while processing */}
            <button
              onClick={() => setShowUpload(false)}
              disabled={uploading || !!uploadResult}
              aria-label="Close upload panel"
              style={{
                position: "absolute", top: 12, right: 12,
                width: 28, height: 28, borderRadius: "50%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--tm-border-soft)",
                color: "var(--tm-text-faint)",
                fontSize: 14, cursor: uploading || uploadResult ? "default" : "pointer",
                display: uploading || uploadResult ? "none" : "flex",
                alignItems: "center", justifyContent: "center",
                fontFamily: "inherit", transition: "all var(--tm-dur) var(--tm-ease)",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--tm-danger-wash)"
                ;(e.currentTarget as HTMLButtonElement).style.color = "var(--tm-danger)"
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = "var(--tm-danger)"
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"
                ;(e.currentTarget as HTMLButtonElement).style.color = "var(--tm-text-faint)"
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = "var(--tm-border-soft)"
              }}
            >
              ✕
            </button>

            <div className="tm-label-caps" style={{ marginBottom: 6 }}>
              {hasCv ? "Rework CV Baseline" : "Upload Baseline CV"}
            </div>
            <h2 style={{ fontSize: "var(--tm-fs-heading)", fontWeight: 600, color: "var(--tm-text)", marginBottom: 20 }}>
              {hasCv ? "Replace the baseline only if the original CV was wrong" : "Upload your baseline CV"}
            </h2>

            {error && (
              <p role="alert" style={{ marginBottom: 12, fontSize: "var(--tm-fs-meta)", color: "var(--tm-danger)" }}>{error}</p>
            )}

            {(uploading || uploadResult) ? (
              <CVUploadProcessing
                success={!!uploadResult}
                result={uploadResult ?? undefined}
              />
            ) : (
              <StepCV onNext={handleUpload} />
            )}
          </div>
        </div>
      )}
    </AppShell>
  )
}
