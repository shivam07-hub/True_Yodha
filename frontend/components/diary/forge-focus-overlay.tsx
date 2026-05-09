"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const DURATIONS = [
  { label: "25 min", seconds: 25 * 60 },
  { label: "40 min", seconds: 40 * 60 },
  { label: "60 min", seconds: 60 * 60 },
]

const RING_CIRC = 2 * Math.PI * 44

function formatClock(seconds: number): string {
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0")
  const secs = String(seconds % 60).padStart(2, "0")
  return `${mins}:${secs}`
}

export interface ForgeCompletionPayload {
  reflection: string
  durationSeconds: number
}

interface ForgeFocusOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  milestoneText: string
  focusSkill: string
  cvHref: string
  hasJobContext: boolean
  onSessionComplete: (payload: ForgeCompletionPayload) => Promise<{ xpGained: number }>
  onGenerateJobCv?: () => Promise<{ notice?: string } | void>
}

export function ForgeFocusOverlay({
  open,
  onOpenChange,
  milestoneText,
  focusSkill,
  cvHref,
  hasJobContext,
  onSessionComplete,
  onGenerateJobCv,
}: ForgeFocusOverlayProps) {
  const [durIdx, setDurIdx] = useState(0)
  const [remaining, setRemaining] = useState(DURATIONS[0].seconds)
  const [running, setRunning] = useState(false)
  const [sessions, setSessions] = useState(0)
  const [needsReflection, setNeedsReflection] = useState(false)
  const [reflection, setReflection] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [earnedXp, setEarnedXp] = useState<number | null>(null)
  const [jobCvPending, setJobCvPending] = useState(false)
  const [jobCvNotice, setJobCvNotice] = useState<string | null>(null)

  const duration = DURATIONS[durIdx].seconds
  const progress = duration > 0 ? remaining / duration : 0
  const dashArray = `${RING_CIRC * progress} ${RING_CIRC}`

  useEffect(() => {
    if (!open || !running) return
    const id = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          clearInterval(id)
          setRunning(false)
          setNeedsReflection(true)
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [open, running])

  useEffect(() => {
    if (!open) return
    setDurIdx(0)
    setRemaining(DURATIONS[0].seconds)
    setRunning(false)
    setSessions(0)
    setNeedsReflection(false)
    setReflection("")
    setSaving(false)
    setSaveError(null)
    setEarnedXp(null)
    setJobCvPending(false)
    setJobCvNotice(null)
  }, [open])

  function selectDuration(nextIdx: number) {
    if (running || needsReflection || earnedXp !== null) return
    setDurIdx(nextIdx)
    setRemaining(DURATIONS[nextIdx].seconds)
  }

  function restart() {
    setRunning(false)
    setRemaining(duration)
    setNeedsReflection(false)
    setReflection("")
    setSaveError(null)
    setEarnedXp(null)
    setJobCvNotice(null)
  }

  async function completeSession() {
    const trimmed = reflection.trim()
    if (!trimmed) {
      setSaveError("Add a short note so we can anchor this session to your progress.")
      return
    }
    try {
      setSaving(true)
      setSaveError(null)
      const result = await onSessionComplete({
        reflection: trimmed,
        durationSeconds: duration,
      })
      setEarnedXp(result.xpGained)
      setNeedsReflection(false)
      setSessions((value) => value + 1)
      setJobCvNotice(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save this focus session.")
    } finally {
      setSaving(false)
    }
  }

  async function generateJobCv() {
    if (!onGenerateJobCv) return
    try {
      setJobCvPending(true)
      const result = await onGenerateJobCv()
      setJobCvNotice(result?.notice ?? "Job CV pointer is ready in CV Builder.")
    } catch (err) {
      setJobCvNotice(err instanceof Error ? err.message : "Could not generate the job CV pointer.")
    } finally {
      setJobCvPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="fixed inset-0 z-50 h-dvh max-w-none translate-x-0 translate-y-0 rounded-none border-none p-0"
      >
        <div
          style={{
            height: "100dvh",
            width: "100vw",
            background: "rgba(5,10,24,0.9)",
            border: "1px solid var(--tm-border-soft)",
            boxSizing: "border-box",
            paddingTop: "max(env(safe-area-inset-top), 24px)",
            paddingRight: "max(env(safe-area-inset-right), 24px)",
            paddingBottom: "max(env(safe-area-inset-bottom), 24px)",
            paddingLeft: "max(env(safe-area-inset-left), 24px)",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Forge mode</DialogTitle>
            <DialogDescription>Deep focus timer for today&apos;s milestone.</DialogDescription>
          </DialogHeader>

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 700 }}>
              <p className="tm-label-caps text-balance" style={{ margin: 0 }}>Deep Focus Chamber</p>
              <p className="text-pretty" style={{ margin: 0, fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.7 }}>
                Keep cursor motion flowing through the field while you stay anchored to one skill.
              </p>
            </div>
            <Button
              variant="outline"
              size="md"
              onClick={() => onOpenChange(false)}
              className="whitespace-nowrap shrink-0"
            >
              Exit Forge
            </Button>
          </div>

          <div style={{ flex: 1, display: "grid", placeItems: "center", minHeight: 0 }}>
            <div style={{ width: "min(74vh, 74vw)", maxWidth: 720, aspectRatio: "1 / 1", position: "relative" }}>
              <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
                <circle cx={50} cy={50} r={44} fill="none" stroke="var(--tm-border-soft)" strokeWidth={1.8} />
                <circle cx={50} cy={50} r={44} fill="none" stroke="var(--tm-accent-wash)" strokeWidth={4.2} />
                <circle
                  cx={50}
                  cy={50}
                  r={44}
                  fill="none"
                  stroke="var(--tm-accent)"
                  strokeWidth={4.4}
                  strokeLinecap="round"
                  strokeDasharray={dashArray}
                  style={{ transition: running ? "stroke-dasharray 1s linear" : "stroke-dasharray 220ms ease-out" }}
                />
              </svg>

              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  textAlign: "center",
                  padding: 20,
                }}
              >
                <div className="tm-label-caps text-balance" style={{ fontSize: 10, color: "var(--tm-text-faint)" }}>
                  {focusSkill}
                </div>
                <div
                  style={{
                    fontFamily: "var(--tm-font-mono)",
                    fontSize: "clamp(56px, 9vw, 108px)",
                    lineHeight: 0.95,
                    color: "var(--tm-text)",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatClock(remaining)}
                </div>
                <p className="text-pretty" style={{ margin: 0, fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.6 }}>
                  {needsReflection ? "Session complete. Log your notes to lock this progress." : running ? "Stay with one task until the ring closes." : "Ready when you are."}
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--tm-radius)",
                border: "1px solid var(--tm-accent-ring)",
                background: "var(--tm-accent-wash)",
              }}
            >
              <div className="tm-label-caps text-balance" style={{ marginBottom: 5 }}>Today&apos;s Milestone</div>
              <p className="text-pretty" style={{ margin: 0, fontSize: 13, color: "var(--tm-text)", lineHeight: 1.65 }}>
                {milestoneText}
              </p>
            </div>

            {!needsReflection && earnedXp === null && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DURATIONS.map((item, index) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => selectDuration(index)}
                      disabled={running}
                      style={{
                        padding: "5px 11px",
                        borderRadius: "var(--tm-radius-pill)",
                        border: `1px solid ${index === durIdx ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                        background: index === durIdx ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
                        color: index === durIdx ? "var(--tm-accent)" : "var(--tm-text-faint)",
                        fontSize: 12,
                        fontFamily: "inherit",
                        cursor: running ? "default" : "pointer",
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="solid" size="md" onClick={() => setRunning((value) => !value)}>
                    {running ? "Pause" : "Start"}
                  </Button>
                  <Button variant="outline" size="md" onClick={restart}>
                    Reset
                  </Button>
                </div>
              </div>
            )}

            {needsReflection && earnedXp === null && (
              <div
                style={{
                  borderRadius: "var(--tm-radius)",
                  border: "1px solid var(--tm-border)",
                  background: "rgba(255,255,255,0.03)",
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div className="tm-label-caps text-balance">Quick Session Note</div>
                <p className="text-pretty" style={{ margin: 0, fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.6 }}>
                  Write one short line about what you practiced, improved, or discovered in this block.
                </p>
                <textarea
                  value={reflection}
                  onChange={(event) => setReflection(event.target.value)}
                  placeholder={`I practiced ${focusSkill} by...`}
                  style={{
                    width: "100%",
                    minHeight: 86,
                    resize: "none",
                    borderRadius: "var(--tm-radius-sm)",
                    border: "1px solid var(--tm-border)",
                    background: "var(--tm-surface-2)",
                    color: "var(--tm-text)",
                    padding: "10px 12px",
                    fontSize: 13,
                    lineHeight: 1.6,
                    fontFamily: "inherit",
                  }}
                />
                {saveError && (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--tm-danger)" }}>{saveError}</p>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <Button variant="outline" size="md" onClick={restart}>
                    Restart Session
                  </Button>
                  <Button
                    variant="solid"
                    size="md"
                    onClick={completeSession}
                    loading={saving}
                  >
                    Claim XP
                  </Button>
                </div>
              </div>
            )}

            {earnedXp !== null && (
              <div
                style={{
                  borderRadius: "var(--tm-radius)",
                  border: "1px solid var(--tm-accent-ring)",
                  background: "var(--tm-accent-wash)",
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div className="tm-label-caps text-balance">Session Logged</div>
                  <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 15, color: "var(--tm-accent)", fontVariantNumeric: "tabular-nums" }}>
                    +{earnedXp} XP
                  </div>
                </div>
                <p className="text-pretty" style={{ margin: 0, fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.6 }}>
                  Your progress is now attached to this skill thread. Keep stacking sessions to build stronger CV signal.
                </p>
                {jobCvNotice && (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.6 }}>
                    {jobCvNotice}
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button variant="solid" size="md" render={<a href={cvHref} />}>
                      Build CV Pointer
                    </Button>
                    {hasJobContext && onGenerateJobCv && (
                      <Button
                        variant="outline"
                        size="md"
                        onClick={generateJobCv}
                        loading={jobCvPending}
                      >
                        Generate Job CV
                      </Button>
                    )}
                  </div>
                  <Button variant="outline" size="md" onClick={restart}>
                    Start Another Session
                  </Button>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: "var(--tm-text-faint)", lineHeight: 1.5 }}>
                  Sessions completed in this run: <span style={{ fontVariantNumeric: "tabular-nums" }}>{sessions}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
