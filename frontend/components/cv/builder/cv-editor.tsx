/**
 * CVEditor — Option C right pane: the rendered CV *is* the editor.
 *
 * Each line carries its own actions inline: Copy (drop the exact text into a
 * company career-page form), Rewrite (Mentor streams a stronger version as a
 * diff), Edit (inline textarea), Hide (drop it from this job's projection).
 * Rewrites/edits write a new Main-CV baseline via rewriteApply; hides toggle the
 * job projection (auto-saved by the playground hook). The left rail can target a
 * specific bullet's rewrite via `rewriteTarget`.
 */
"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { users, type CVContact, type CVStructured, type UserProfile } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import { dataKeys } from "@/lib/domain-data"
import { CVPointRow, type CVPointMeta } from "./cv-point-row"
import type { KeywordTarget } from "./keyword-utils"
import { runContentChecks, type ContentFinding } from "./content-checks"
import type { AppliedFix, V2Fix } from "./fix-model"

export interface RewriteTarget { iid: string; keywords: string[] }

interface CVEditorProps {
  token: string
  cv: CVStructured
  profile: UserProfile | null
  hiddenItems: Set<string>
  toggleItem: (iid: string) => void
  targets: KeywordTarget[]
  missingKeywords: string[]
  applying: boolean
  onApply: (oldText: string, newText: string) => void
  onAddBullet: (roleIndex: number, text: string) => void
  addingBullet: boolean
  visibleCount: number
  wordCount: number
  rewriteTarget: RewriteTarget | null
  onClearRewriteTarget: () => void
  /** v2: open fixes → each host bullet wears a "{kind} +N" pill that opens its
   *  fix card; applied fixes mark their bullet "✓ +N" for the session. */
  fixes?: V2Fix[]
  applied?: AppliedFix[]
  onFixPill?: (fix: V2Fix) => void
  /** Fix ids the user dismissed in the rail — their issue chips stop nagging the
   *  bullet too (finding id == fix id for recruiter checks). */
  dismissedFixIds?: Set<string>
  /** v2: jump request — scroll to and pulse a bullet (n re-triggers same iid). */
  flash?: { iid: string; n: number } | null
  /** Main-CV surface: the SAME paper, but identity fields become editable and
   *  Education + Certifications become editable entries (a job-tailored CV can't
   *  touch identity — one source of truth is the master; the tailoring surface
   *  renders them read-only). Summary + Skills stay always-visible so an empty
   *  master can be filled. Every write is a cheap living-master patch via
   *  onPatch (autosave), never a rewrite baseline. Fix "+N" is suppressed —
   *  a rewrite doesn't move the Myro Score. */
  master?: {
    onPatch: (mut: (d: CVStructured) => CVStructured) => void
  }
}

const clip = (s: string, n = 56) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) { void navigator.clipboard.writeText(text); return }
  } catch { /* fall through */ }
  const ta = document.createElement("textarea")
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"
  document.body.appendChild(ta); ta.focus(); ta.select()
  try { document.execCommand("copy") } catch { /* noop */ }
  document.body.removeChild(ta)
}

export function CVEditor({
  token, cv, profile, hiddenItems, toggleItem, targets, missingKeywords,
  applying, onApply, onAddBullet, addingBullet, visibleCount, wordCount, rewriteTarget, onClearRewriteTarget,
  fixes, applied, onFixPill, dismissedFixIds, flash, master,
}: CVEditorProps) {
  const isMaster = !!master
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [editingIid, setEditingIid] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const [rewriteIid, setRewriteIid] = useState<string | null>(null)
  const [rewriteKw, setRewriteKw] = useState<string[]>([])
  const [composerRole, setComposerRole] = useState<number | null>(null)
  const [composerDraft, setComposerDraft] = useState("")
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const userSkillsQuery = useQuery({
    queryKey: dataKeys.userSkills(),
    queryFn: () => users.mySkills(token),
    staleTime: 5 * 60 * 1000,
  })

  // Every existing bullet, keyed by its iid → which role it lives under. Powers the
  // rewrite target picker (hop the suggestion to any bullet) and "New point" (which
  // role a fresh bullet lands under). Cheap to rebuild — the CV is small.
  const iidMeta = new Map<string, CVPointMeta>()
  const expGroups = cv.experience.map((e, ei) => ({
    label: `${e.role}${e.company ? ` · ${e.company}` : ""}`,
    opts: e.bullets.map((b, bi) => {
      const iid = itemId("exp_bullet", ei * 100 + bi, b)
      iidMeta.set(iid, { roleIndex: ei, kind: "exp" })
      return { iid, label: clip(b) }
    }),
  }))
  const projOpts = cv.projects.flatMap((p, pi) =>
    p.bullets.map((b, bi) => {
      const iid = itemId("proj_bullet", pi * 100 + bi, b)
      iidMeta.set(iid, { roleIndex: -1, kind: "proj" })
      return { iid, label: clip(b) }
    }),
  )

  // Deterministic recruiter-check findings (#34 S2), grouped by the editor iid of
  // the bullet each one flags — so a row can wash + chip its own issues. Rebuilt
  // from the live CV, so a fix drops off the moment the text stops triggering it.
  // Hidden lines are excluded from the scan (they're off this CV — a visible
  // bullet must not read as "repeats" against a hidden twin), and dismissed
  // fixes drop their chips (finding id == fix id).
  const findingsByIid = new Map<string, ContentFinding[]>()
  for (const f of runContentChecks(cv, hiddenItems)) {
    if (dismissedFixIds?.has(f.id)) continue
    let iid: string | null = null
    if (f.section === "summary" && cv.summary != null) {
      iid = itemId("summary", 0, cv.summary)
    } else if (f.section === "experience") {
      const b = cv.experience[f.itemIndex]?.bullets[f.bulletIndex]
      if (b != null) iid = itemId("exp_bullet", f.itemIndex * 100 + f.bulletIndex, b)
    } else if (f.section === "projects") {
      const b = cv.projects[f.itemIndex]?.bullets[f.bulletIndex]
      if (b != null) iid = itemId("proj_bullet", f.itemIndex * 100 + f.bulletIndex, b)
    }
    if (iid) findingsByIid.set(iid, [...(findingsByIid.get(iid) ?? []), f])
  }

  function openComposer(roleIndex: number) {
    setEditingIid(null); setRewriteIid(null); setComposerDraft(""); setComposerRole(roleIndex)
  }
  function saveComposer(roleIndex: number) {
    const next = composerDraft.trim()
    if (next) onAddBullet(roleIndex, next)
    setComposerRole(null); setComposerDraft("")
  }
  function retarget(iid: string) {
    setRewriteIid(iid)
    requestAnimationFrame(() => rowRefs.current[iid]?.scrollIntoView({ behavior: "smooth", block: "center" }))
  }

  // A rail "Sharpen / Add" action targets one host bullet — open its rewrite and
  // bring it into view, then clear the request so re-targeting the same row works.
  useEffect(() => {
    if (!rewriteTarget) return
    setEditingIid(null)
    setRewriteIid(rewriteTarget.iid)
    setRewriteKw(rewriteTarget.keywords)
    rowRefs.current[rewriteTarget.iid]?.scrollIntoView({ behavior: "smooth", block: "center" })
    onClearRewriteTarget()
  }, [rewriteTarget, onClearRewriteTarget])

  // v2 jump: a fix card / skill row names a bullet — scroll to it and pulse.
  useEffect(() => {
    if (!flash) return
    const el = rowRefs.current[flash.iid]
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.classList.remove("cvb-v2-pulse")
    // Force a reflow so re-jumping the same bullet replays the pulse.
    void el.offsetWidth
    el.classList.add("cvb-v2-pulse")
    const t = setTimeout(() => el.classList.remove("cvb-v2-pulse"), 1600)
    return () => clearTimeout(t)
  }, [flash])

  // v2: first open fix / last applied fix per host bullet — drives the inline
  // "{kind} +N" pill and the session "✓ +N" mark.
  const fixByIid = new Map<string, V2Fix>()
  for (const f of fixes ?? []) if (!fixByIid.has(f.iid)) fixByIid.set(f.iid, f)
  const appliedByIid = new Map<string, AppliedFix>()
  for (const a of applied ?? []) appliedByIid.set(a.iid, a)

  function copy(id: string, text: string) {
    copyText(text)
    setCopiedId(id)
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopiedId(null), 1500)
  }
  function startEdit(iid: string, text: string) {
    setRewriteIid(null); setEditingIid(iid); setEditDraft(text)
  }
  function saveEdit(original: string) {
    const next = editDraft.trim()
    if (next && next !== original) onApply(original, next)
    setEditingIid(null)
  }

  function copyAllText(): string {
    const parts: string[] = []
    if (cv.summary && !hiddenItems.has(itemId("summary", 0, cv.summary))) parts.push(cv.summary)
    cv.experience.forEach((e, ei) => e.bullets.forEach((b, bi) => {
      if (!hiddenItems.has(itemId("exp_bullet", ei * 100 + bi, b))) parts.push(b)
    }))
    cv.projects.forEach((p, pi) => p.bullets.forEach((b, bi) => {
      if (!hiddenItems.has(itemId("proj_bullet", pi * 100 + bi, b))) parts.push(b)
    }))
    if (cv.skills_line && !hiddenItems.has(itemId("skills_line", 0, cv.skills_line))) parts.push(cv.skills_line)
    visibleEducation.forEach(ed =>
      parts.push([ed.institution, ed.degree, ed.grade, ed.dates].filter(Boolean).join(" · ")))
    visibleCerts.forEach(c => parts.push(c))
    return parts.join("\n\n")
  }

  // Master-owned identity sections, filtered by the projection like the exported
  // artifact (pdf-page.tsx uses the same iid derivation — keep in sync).
  const visibleEducation = cv.education.filter((ed, i) => {
    const idLine = [ed.institution, ed.degree, ed.dates].filter(Boolean).join(" · ")
    return !hiddenItems.has(itemId("edu", i, idLine))
  })
  const visibleCerts = cv.certs.filter((c, i) => !hiddenItems.has(itemId("cert", i, c)))

  const contactName = cv.contact?.name?.trim() || profile?.full_name?.trim() || "Your name"
  const contactTitle = cv.contact?.title?.trim() || cv.experience[0]?.role || ""
  const contactMeta = [cv.contact?.email || profile?.email, cv.contact?.linkedin || profile?.linkedin_url]
    .filter(Boolean).join(" · ")

  function row(iid: string, text: string, opts: { mono?: boolean } = {}) {
    const hidden = hiddenItems.has(iid)
    const editing = editingIid === iid
    const copied = copiedId === iid
    const fix = !hidden && !editing ? fixByIid.get(iid) : undefined
    const appliedFix = !hidden && !editing && !fix ? appliedByIid.get(iid) : undefined
    return (
      <CVPointRow
        key={iid}
        token={token}
        iid={iid}
        text={text}
        hidden={hidden}
        mono={opts.mono}
        editing={editing}
        editDraft={editDraft}
        copied={copied}
        targets={targets}
        userSkills={userSkillsQuery.data}
        findings={findingsByIid.get(iid)}
        rewriteOpen={rewriteIid === iid}
        rewriteKeywords={rewriteKw}
        missingKeywords={missingKeywords}
        applying={applying}
        meta={iidMeta.get(iid)}
        expGroups={expGroups}
        projOpts={projOpts}
        rowRef={(el) => { rowRefs.current[iid] = el }}
        onToggle={() => toggleItem(iid)}
        onEditDraftChange={setEditDraft}
        onSaveEdit={() => saveEdit(text)}
        onCopy={() => copy(iid, text)}
        onStartEdit={() => startEdit(iid, text)}
        onToggleRewrite={() => {
          setEditingIid(null)
          setRewriteKw(missingKeywords)
          setRewriteIid((prev) => prev === iid ? null : iid)
        }}
        onRetarget={retarget}
        onOpenComposer={openComposer}
        onApply={onApply}
        onCloseRewrite={() => setRewriteIid(null)}
        fixPill={fix && onFixPill ? { label: isMaster ? fix.kind : `${fix.kind} +${fix.gain}`, onClick: () => onFixPill(fix) } : undefined}
        appliedMark={appliedFix ? (isMaster ? "✓" : `✓ +${appliedFix.gain}`) : undefined}
        hideToggle={isMaster}
      />
    )
  }

  // Master identity/section editing — every write is a living-master patch.
  const setContact = (key: keyof CVContact, value: string) =>
    master?.onPatch(d => ({
      ...d,
      contact: {
        name: "", title: "", email: "", phone: "", location: "", linkedin: "",
        ...(d.contact ?? {}), [key]: value,
      },
    }))
  const c = cv.contact

  const allCopied = copiedId === "__all"
  return (
    <div>
      <div className="cvb-pgc-editor-head">
        <div className="cvb-pgc-editor-meta">
          <span className="mono">{visibleCount} bullets · ~{wordCount} words · one page</span>
          <button
            type="button"
            className={`cvb-pgc-copyall${allCopied ? " copied" : ""}`}
            onClick={() => copy("__all", copyAllText())}
          >⧉ {allCopied ? "Copied all" : "Copy all"}</button>
        </div>
      </div>

      <div className="cvb-pgc-paper">
        {isMaster ? (
          <div className="cvb-pgc-contact-card cvb-pgc-mcard">
            <input className="cvb-pgc-minput name" value={c?.name ?? ""} placeholder="Full name"
              onChange={e => setContact("name", e.target.value)} />
            <input className="cvb-pgc-minput role" value={c?.title ?? ""} placeholder="Headline (e.g. GTM Manager)"
              onChange={e => setContact("title", e.target.value)} />
            <div className="cvb-pgc-mgrid">
              <input className="cvb-pgc-minput mono" type="email" value={c?.email ?? ""} placeholder="Email"
                onChange={e => setContact("email", e.target.value)} />
              <input className="cvb-pgc-minput mono" type="tel" value={c?.phone ?? ""} placeholder="Phone"
                onChange={e => setContact("phone", e.target.value)} />
              <input className="cvb-pgc-minput mono" value={c?.location ?? ""} placeholder="Location"
                onChange={e => setContact("location", e.target.value)} />
              <input className="cvb-pgc-minput mono" value={c?.linkedin ?? ""} placeholder="LinkedIn URL"
                onChange={e => setContact("linkedin", e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="cvb-pgc-contact-card">
            <div className="cvb-pgc-name">{contactName}</div>
            {contactTitle && <div className="cvb-pgc-role">{contactTitle}</div>}
            {contactMeta && <div className="cvb-pgc-contact mono">{contactMeta}</div>}
          </div>
        )}
        <div className="cvb-pgc-rule" />

        {isMaster ? (
          <>
            <div className="cvb-pgc-section">SUMMARY</div>
            <textarea
              className="cvb-pgc-edit cvb-pgc-mtext"
              rows={3}
              value={cv.summary ?? ""}
              placeholder="One short paragraph about who you are."
              onChange={e => master?.onPatch(d => ({ ...d, summary: e.target.value }))}
            />
          </>
        ) : cv.summary && (
          <>
            <div className="cvb-pgc-section">SUMMARY</div>
            {row(itemId("summary", 0, cv.summary), cv.summary)}
          </>
        )}

        {cv.experience.length > 0 && <div className="cvb-pgc-section">EXPERIENCE</div>}
        {cv.experience.map((exp, ei) => (
          <div key={`exp-${ei}`} className="cvb-pgc-role-block">
            <div className="cvb-pgc-role-head">
              <span className="cvb-pgc-role-title">{exp.role} <span>· {exp.company}</span></span>
              {exp.dates && <span className="mono cvb-pgc-role-dates">{exp.dates}</span>}
            </div>
            {exp.bullets.map((b, bi) => row(itemId("exp_bullet", ei * 100 + bi, b), b))}
            {composerRole === ei ? (
              <div className="cvb-pgc-composer">
                <textarea
                  className="cvb-pgc-edit"
                  value={composerDraft}
                  rows={3}
                  autoFocus
                  placeholder="What you actually did here"
                  onChange={e => setComposerDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveComposer(ei) } }}
                />
                <div className="cvb-pgc-composer-acts">
                  <button type="button" className="cvb-pgc-newpoint" onClick={() => setComposerRole(null)}>Cancel</button>
                  <button
                    type="button"
                    className="cvb-pgc-done"
                    disabled={addingBullet || !composerDraft.trim()}
                    onClick={() => saveComposer(ei)}
                  >{addingBullet ? "Adding…" : "Add point"}</button>
                </div>
              </div>
            ) : (
              <button type="button" className="cvb-pgc-addpoint" onClick={() => openComposer(ei)}>＋ Add a point</button>
            )}
          </div>
        ))}

        {cv.projects.length > 0 && <div className="cvb-pgc-section">PROJECTS</div>}
        {cv.projects.map((p, pi) => (
          <div key={`proj-${pi}`} className="cvb-pgc-role-block">
            {p.name && <div className="cvb-pgc-role-head"><span className="cvb-pgc-role-title">{p.name}</span></div>}
            {p.bullets.map((b, bi) => row(itemId("proj_bullet", pi * 100 + bi, b), b))}
          </div>
        ))}

        {isMaster ? (
          <>
            <div className="cvb-pgc-section">SKILLS</div>
            <textarea
              className="cvb-pgc-edit cvb-pgc-mtext mono"
              rows={2}
              value={cv.skills_line ?? ""}
              placeholder="Comma-separated skills."
              onChange={e => master?.onPatch(d => ({ ...d, skills_line: e.target.value }))}
            />

            <div className="cvb-pgc-section cvb-pgc-msection-head">
              <span>EDUCATION</span>
              <button type="button" className="cvb-pgc-addpoint" onClick={() => master?.onPatch(d => ({
                ...d, education: [...d.education, { institution: "", degree: "", dates: "", grade: "", location: "" }],
              }))}>＋ Add</button>
            </div>
            {cv.education.map((ed, i) => (
              <div key={`edu-${i}`} className="cvb-pgc-mentry">
                <div className="cvb-pgc-mgrid two">
                  <input className="cvb-pgc-minput" value={ed.institution} placeholder="Institution"
                    onChange={e => master?.onPatch(d => { d.education[i].institution = e.target.value; return d })} />
                  <input className="cvb-pgc-minput" value={ed.degree} placeholder="Degree"
                    onChange={e => master?.onPatch(d => { d.education[i].degree = e.target.value; return d })} />
                  <input className="cvb-pgc-minput mono" value={ed.dates} placeholder="Dates"
                    onChange={e => master?.onPatch(d => { d.education[i].dates = e.target.value; return d })} />
                  <input className="cvb-pgc-minput mono" value={ed.grade} placeholder="Grade"
                    onChange={e => master?.onPatch(d => { d.education[i].grade = e.target.value; return d })} />
                </div>
                <button type="button" className="cvb-pgc-mdel" aria-label="Remove education"
                  onClick={() => master?.onPatch(d => { d.education.splice(i, 1); return d })}>×</button>
              </div>
            ))}

            <div className="cvb-pgc-section cvb-pgc-msection-head">
              <span>CERTIFICATIONS</span>
              <button type="button" className="cvb-pgc-addpoint"
                onClick={() => master?.onPatch(d => ({ ...d, certs: [...d.certs, ""] }))}>＋ Add</button>
            </div>
            {cv.certs.map((cert, i) => (
              <div key={`cert-${i}`} className="cvb-pgc-mentry">
                <input className="cvb-pgc-minput" value={cert} placeholder="Certification"
                  onChange={e => master?.onPatch(d => { d.certs[i] = e.target.value; return d })} />
                <button type="button" className="cvb-pgc-mdel" aria-label="Remove certification"
                  onClick={() => master?.onPatch(d => { d.certs.splice(i, 1); return d })}>×</button>
              </div>
            ))}
          </>
        ) : cv.skills_line && (
          <>
            <div className="cvb-pgc-section">SKILLS</div>
            {row(itemId("skills_line", 0, cv.skills_line), cv.skills_line, { mono: true })}
          </>
        )}

        {/* Tailoring surface: Education + Certifications are master-owned identity
            sections — shown read-only (hidden-item filtered, so the paper matches
            the exported artifact), edited only on the Main CV. */}
        {!isMaster && visibleEducation.length > 0 && (
          <>
            <div className="cvb-pgc-section">EDUCATION</div>
            {visibleEducation.map((ed, i) => (
              <div key={`edu-${i}`} className="cvb-pgc-role-block">
                <div className="cvb-pgc-role-head">
                  <span className="cvb-pgc-role-title">
                    {ed.institution}
                    {ed.degree && <span> · {ed.degree}</span>}
                    {ed.grade && <span> · {ed.grade}</span>}
                  </span>
                  {ed.dates && <span className="mono cvb-pgc-role-dates">{ed.dates}</span>}
                </div>
              </div>
            ))}
          </>
        )}
        {!isMaster && visibleCerts.length > 0 && (
          <>
            <div className="cvb-pgc-section">CERTIFICATIONS</div>
            {visibleCerts.map((cert, i) => (
              <div key={`cert-${i}`} className="cvb-pgc-role-block">
                <div className="cvb-pgc-role-head">
                  <span className="cvb-pgc-role-title">{cert}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
