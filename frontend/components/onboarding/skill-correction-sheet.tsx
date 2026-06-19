"use client"

import { useEffect, useMemo, useState } from "react"
import { Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { onboarding, skills, type OnboardingProofSkill, type Skill } from "@/lib/api"

interface Props { token: string; baselineId: number; proof: OnboardingProofSkill[]; onSaved: () => void }

export function SkillCorrectionSheet({ token, baselineId, proof, onSaved }: Props) {
  const [catalog, setCatalog] = useState<Skill[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [missing, setMissing] = useState("")
  const [evidence, setEvidence] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void skills.all().then(setCatalog).catch(() => setCatalog([])) }, [])
  const byKey = useMemo(() => new Map(catalog.map((skill) => [skill.taxonomy_key, skill])), [catalog])
  const missingSkill = catalog.find((skill) => skill.display_name.toLocaleLowerCase() === missing.trim().toLocaleLowerCase())

  async function save() {
    const removals = proof.flatMap((item) => {
      const skill = byKey.get(item.taxonomy_key)
      return excluded.has(item.taxonomy_key) && skill ? [{ skill_id: skill.id, action: "exclude" as const, evidence_text: item.evidence || "User marked this detected skill as not mine." }] : []
    })
    const additions = missingSkill && evidence.trim().length >= 5 ? [{ skill_id: missingSkill.id, action: "include" as const, evidence_text: evidence.trim() }] : []
    setBusy(true); setError(null)
    try {
      await onboarding.saveSkillOverrides(token, baselineId, [...removals, ...additions])
      onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Corrections could not be saved.") }
    finally { setBusy(false) }
  }

  return (
    <Dialog>
      <DialogTrigger className="tm-control-focus inline-flex min-h-10 items-center gap-2 rounded px-2 text-sm text-[var(--tm-text-muted)] hover:text-[var(--tm-text)]"><Wrench className="size-4" />Fix what Myro read</DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto bg-[var(--tm-surface)] text-[var(--tm-text)]">
        <DialogHeader><DialogTitle>Fix what Myro read</DialogTitle><DialogDescription>Corrections apply to this CV and trigger one fresh score and match pass.</DialogDescription></DialogHeader>
        <fieldset className="mt-2"><legend className="text-sm font-semibold">Detected skills</legend><div className="mt-2 divide-y divide-[var(--tm-border-soft)] rounded-md border border-[var(--tm-border-soft)]">{proof.map((item) => <label key={item.taxonomy_key} className="flex cursor-pointer gap-3 p-3"><input type="checkbox" checked={excluded.has(item.taxonomy_key)} onChange={(event) => setExcluded((current) => { const next = new Set(current); if (event.target.checked) next.add(item.taxonomy_key); else next.delete(item.taxonomy_key); return next })} className="mt-1 size-4" /><span><span className="block text-sm font-medium">{item.name}</span><span className="mt-1 block text-xs leading-5 text-[var(--tm-text-muted)]">{item.evidence || "No evidence excerpt available."}</span><span className="mt-1 block text-xs font-medium text-[var(--tm-danger)]">Not mine</span></span></label>)}</div></fieldset>
        <div className="mt-3"><label htmlFor="missing-skill" className="text-sm font-semibold">Add a missing skill</label><input id="missing-skill" list="skill-catalog" value={missing} onChange={(event) => setMissing(event.target.value)} placeholder="Start typing a skill" className="tm-control-focus mt-2 min-h-11 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-bg)] px-3" /><datalist id="skill-catalog">{catalog.map((skill) => <option key={skill.id} value={skill.display_name} />)}</datalist><textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} rows={3} placeholder="Paste one sentence from this CV that proves it" className="tm-control-focus mt-2 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-bg)] p-3" /></div>
        {error && <p role="alert" className="text-sm text-[var(--tm-danger)]">{error}</p>}
        <DialogFooter><Button disabled={busy || (excluded.size === 0 && !missingSkill)} onClick={() => void save()}>{busy ? "Saving..." : "Save corrections"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
