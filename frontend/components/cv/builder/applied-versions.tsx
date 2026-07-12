/**
 * AppliedVersionsPanel — the Delta-4 version history (project_living_cv_delta4).
 *
 * A "Version" is a CV the user APPLIED with (cv_application_attempts), not a WIP
 * autosave. Google-Docs-style: browse every applied CV, re-download the exact
 * artifact (WYSIWYG from its stored structured + hides), or restore one as the
 * living master. Shared by the desktop master panel and the mobile hub drawer.
 */
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { cv as cvApi, type AppliedVersion } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { PdfPage, type PdfPageContact } from "./pdf-page"
import { exportSheetPdf } from "@/lib/cv/sheet-pdf"
import { printCvPage } from "@/lib/cv/print-cv"
import { formatDate } from "@/lib/format"
import { cleanJobTitle } from "@/lib/text/strip-markdown"
import { Icon } from "./icons"

function contactOf(v: AppliedVersion): PdfPageContact {
  const c = v.cv_snapshot.structured?.contact
  return {
    name: c?.name?.trim() || "Your name",
    title: c?.title?.trim() || v.cv_snapshot.title || "",
    location: c?.location?.trim() || "",
    email: c?.email?.trim() || "",
    phone: c?.phone?.trim() || "",
    linkedin: c?.linkedin?.trim() || "",
  }
}

function fileNameOf(v: AppliedVersion): string {
  const slug = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
  const parts = [slug(v.cv_snapshot.structured?.contact?.name) || "myro_cv", slug(v.cv_snapshot.company), slug(v.cv_snapshot.title)].filter(Boolean)
  return `${parts.join("__")}.pdf`
}

export function AppliedVersionsPanel({ token }: { token: string }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["cv-applied-versions"],
    queryFn: () => cvApi.appliedVersions(token),
  })
  const versions = useMemo(() => data?.versions ?? [], [data])

  // Race-free download: mount the picked version's sheet in a hidden node, wait
  // one frame for it to render, then serialize + export (ADR-0020 WYSIWYG).
  const sheetRef = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<AppliedVersion | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [restoredId, setRestoredId] = useState<string | null>(null)

  useEffect(() => {
    if (!pending) return
    const raf = requestAnimationFrame(async () => {
      const sheet = sheetRef.current?.querySelector<HTMLElement>(".cvb-pdf-page")
      const name = fileNameOf(pending)
      try {
        if (sheet) await exportSheetPdf(token, sheet, name)
        else printCvPage(name)
      } catch {
        printCvPage(name)
      } finally {
        setPending(null)
        setBusyId(null)
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [pending, token])

  const restore = useMutation({
    mutationFn: (v: AppliedVersion) =>
      cvApi.versions.restoreMaster(token, {
        cv: v.cv_snapshot.structured!,
        hidden_items: v.cv_snapshot.hidden ?? [],
      }),
    onSuccess: (_row, v) => {
      setRestoredId(v.id)
      setConfirmId(null)
      qc.invalidateQueries({ queryKey: dataKeys.cvStructured() })
      qc.invalidateQueries({ queryKey: dataKeys.cvVersions(null) })
      qc.invalidateQueries({ queryKey: dataKeys.scores() })
    },
  })

  function download(v: AppliedVersion) {
    if (busyId) return
    if (!v.cv_snapshot.structured) { printCvPage(fileNameOf(v)); return }
    setBusyId(v.id)
    setPending(v)
  }

  if (isLoading) {
    return <p className="tm-cvhist-empty" role="status">Loading your versions…</p>
  }
  if (versions.length === 0) {
    return (
      <p className="tm-cvhist-empty">
        No versions yet. A version is saved each time you apply with a CV — apply to a job and it lands here.
      </p>
    )
  }

  return (
    <div className="tm-cvhist">
      {versions.map((v) => {
        const restorable = !!v.cv_snapshot.structured
        const justRestored = restoredId === v.id
        return (
          <div key={v.id} className="tm-cvhist-row">
            <div className="tm-cvhist-main">
              <div className="tm-cvhist-title">{cleanJobTitle(v.cv_snapshot.title || "Applied CV")}</div>
              <div className="tm-cvhist-meta">
                {v.cv_snapshot.company && <span>{v.cv_snapshot.company}</span>}
                {v.submitted_at && <span className="tm-cvhist-sep">·</span>}
                {v.submitted_at && <span>Applied {formatDate(v.submitted_at, "medium")}</span>}
                {typeof v.cv_snapshot.score === "number" && v.cv_snapshot.score > 0 && (
                  <>
                    <span className="tm-cvhist-sep">·</span>
                    <span>{v.cv_snapshot.score}/100</span>
                  </>
                )}
              </div>
            </div>
            <div className="tm-cvhist-actions">
              <button type="button" className="tm-lib-btn sm" onClick={() => download(v)} disabled={busyId === v.id}>
                <Icon name="download" size={12} /> {busyId === v.id ? "…" : "PDF"}
              </button>
              {restorable && (
                confirmId === v.id ? (
                  <button
                    type="button"
                    className="tm-lib-btn sm primary"
                    onClick={() => restore.mutate(v)}
                    disabled={restore.isPending}
                  >
                    {restore.isPending ? "Restoring…" : "Make it my CV?"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="tm-lib-btn sm"
                    onClick={() => { setConfirmId(v.id); setRestoredId(null) }}
                    disabled={justRestored}
                  >
                    {justRestored ? "✓ Restored" : "Restore"}
                  </button>
                )
              )}
            </div>
          </div>
        )
      })}

      {/* Hidden render target for the picked version's WYSIWYG sheet. */}
      <div ref={sheetRef} hidden aria-hidden="true">
        {pending?.cv_snapshot.structured && (
          <PdfPage
            cv={pending.cv_snapshot.structured}
            hidden={new Set(pending.cv_snapshot.hidden ?? [])}
            contact={contactOf(pending)}
            company={pending.cv_snapshot.company || undefined}
          />
        )}
      </div>
    </div>
  )
}
