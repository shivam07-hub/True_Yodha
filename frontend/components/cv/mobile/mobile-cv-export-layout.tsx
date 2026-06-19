"use client"

import type { AtsCheck } from "@/components/cv/builder/ats-checks"
import { Icon } from "@/components/cv/builder/icons"
import { Button } from "@/components/ui/button"
import { CV_TEMPLATES, type CVTemplate } from "@/lib/cv/templates"
import { MobileScaledSheet } from "./mobile-document-preview"

interface Props {
  page: React.ReactNode
  template: CVTemplate
  onTemplateChange: (template: CVTemplate) => void
  checks: AtsCheck[]
  passedCount: number
  totalChecks: number
  markHidden: boolean
  markBusy: boolean
  canToggleMark: boolean
  onToggleMark: () => void
  onFixContact?: () => void
  pdfBusy: boolean
  docxBusy: boolean
  docxError: string | null
  onDownloadPdf: () => void
  onDownloadDocx: () => void
  onBack: () => void
}

export function MobileCVExportLayout({
  page,
  template,
  onTemplateChange,
  checks,
  passedCount,
  totalChecks,
  markHidden,
  markBusy,
  canToggleMark,
  onToggleMark,
  onFixContact,
  pdfBusy,
  docxBusy,
  docxError,
  onDownloadPdf,
  onDownloadDocx,
  onBack,
}: Props) {
  const firstIssue = checks.find(check => !check.pass)

  return (
    <div className="tm-mcv-focus tm-mcv-export" role="dialog" aria-modal="true" aria-label="Export CV">
      <header className="tm-mcv-focus-head">
        <Button
          type="button"
          variant="ghost"
          size="icon-md"
          className="min-h-[44px] min-w-[44px]"
          aria-label="Back to CV"
          onClick={onBack}
        >
          <Icon name="chevron-right" size={22} style={{ transform: "rotate(180deg)" }} />
        </Button>
        <h2>Export CV</h2>
        <span aria-hidden="true" />
      </header>

      <main className="tm-mcv-focus-body">
        <MobileScaledSheet>{page}</MobileScaledSheet>

        <section className="tm-mcv-export-section" aria-labelledby="tm-mcv-template-title">
          <h3 id="tm-mcv-template-title">Template</h3>
          <div className="tm-mcv-template-grid" role="radiogroup" aria-label="CV template">
            {CV_TEMPLATES.map(item => (
              <button
                type="button"
                role="radio"
                aria-checked={template === item.id}
                className={template === item.id ? "is-active" : ""}
                key={item.id}
                onClick={() => onTemplateChange(item.id)}
              >
                <span className={`tm-mcv-template-thumb is-${item.id}`} aria-hidden="true">
                  <i /><i /><i /><i /><i />
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="tm-mcv-export-review" aria-labelledby="tm-mcv-ats-title">
          <div>
            <h3 id="tm-mcv-ats-title">{passedCount} of {totalChecks} checks passed</h3>
            {firstIssue?.detail && <p><Icon name="target" size={16} /> {firstIssue.detail}</p>}
          </div>
          {firstIssue?.label === "Contact block complete" && onFixContact && (
            <Button type="button" variant="ghost" size="md" onClick={onFixContact}>Fix</Button>
          )}
        </section>

        <label className="tm-mcv-mark-row">
          <span><Icon name="check" size={18} /> Add Myro verification mark</span>
          <input
            type="checkbox"
            role="switch"
            checked={!markHidden}
            disabled={!canToggleMark || markBusy}
            onChange={onToggleMark}
          />
        </label>

        {docxError && <p className="tm-mcv-inline-error" role="alert">{docxError}</p>}
      </main>

      <footer className="tm-mcv-export-actions">
        <Button type="button" size="lg" loading={pdfBusy} onClick={onDownloadPdf}>
          <Icon name="download" /> Download PDF
        </Button>
        <Button type="button" variant="outline" size="lg" loading={docxBusy} onClick={onDownloadDocx}>
          <Icon name="file" /> Download DOCX
        </Button>
      </footer>
    </div>
  )
}
