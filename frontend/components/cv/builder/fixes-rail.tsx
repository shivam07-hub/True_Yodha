/**
 * FixesRail — CV Playground v2 right-rail "Fixes" tab.
 *
 * One card per bullet issue (fix-model). A card names the defect, the exact +N
 * it returns, and its host bullet — clicking the card jumps to and pulses that
 * line. Expanding opens the Mentor pick-a-version rewrite INSIDE the card
 * (lazy: the LLM runs only when a card is opened); "Use this version" applies
 * the rewrite in place and Ready counts up by exactly the promised amount.
 * Quantify fixes route through the rewrite's no-fab metric question — the
 * number always comes from the user.
 */
"use client"

import { BulletRewrite } from "./bullet-rewrite"
import type { AppliedFix, V2Fix, V2FixKind } from "./fix-model"

const KIND_CLASS: Record<V2FixKind, string> = {
  Quantify: "quantify",
  Verb: "verb",
  Cut: "cut",
  Fix: "dedupe",
  "Surface skill": "surface",
  Sharpen: "sharpen",
}

interface FixesRailProps {
  token: string
  fixes: V2Fix[]
  applied: AppliedFix[]
  delta: number
  expandedId: string | null
  applying: boolean
  onExpand: (fix: V2Fix | null) => void
  onJump: (iid: string) => void
  onApply: (fix: V2Fix, oldText: string, newText: string) => void
  onGoPreview: () => void
  onOpenIntake: () => void
}

export function FixesRail({
  token, fixes, applied, delta, expandedId, applying,
  onExpand, onJump, onApply, onGoPreview, onOpenIntake,
}: FixesRailProps) {
  const allFixed = fixes.length === 0

  return (
    <div className="cvb-v2-railpane">
      {!allFixed && (
        <p className="cvb-v2-rail-lede">
          Each fix targets one bullet. Click a card to jump to it; applying rewrites
          it in place and raises your score by exactly the amount shown.
        </p>
      )}

      {fixes.map(f => {
        const open = expandedId === f.id
        return (
          <div
            key={f.id}
            className={`cvb-v2-fixcard${open ? " open" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => { onJump(f.iid); onExpand(open ? null : f) }}
            onKeyDown={e => {
              if (e.target !== e.currentTarget) return  // keys inside the rewrite stay there
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJump(f.iid); onExpand(open ? null : f) }
            }}
          >
            <div className="cvb-v2-fixcard-top">
              <span className={`cvb-v2-kind ${KIND_CLASS[f.kind]} mono`}>{f.kind}</span>
              {f.levelNote && <span className="cvb-v2-lvlnote mono">{f.levelNote}</span>}
              <span className="cvb-v2-fixgain mono">+{f.gain}</span>
            </div>
            <div className="cvb-v2-fixtitle">{f.title}</div>
            <div className="cvb-v2-fixdesc">{f.desc}</div>

            {open ? (
              /* Mentor pick-a-version, in place. Stop clicks so typing in the
                 metric input doesn't collapse the card. */
              <div className="cvb-v2-fixrw" onClick={e => e.stopPropagation()}>
                <BulletRewrite
                  token={token}
                  bullet={f.bulletText}
                  missingKeywords={f.keywords}
                  seedKeywords={f.keywords}
                  auto
                  applying={applying}
                  onApply={(oldText, newText) => onApply(f, oldText, newText)}
                  onClose={() => onExpand(null)}
                />
              </div>
            ) : (
              <div className="cvb-v2-fixhost mono">
                <span>bullet → </span>{f.bulletText}
              </div>
            )}

            {!open && (
              <button
                type="button"
                className="cvb-v2-fixapply"
                onClick={e => { e.stopPropagation(); onJump(f.iid); onExpand(f) }}
              >
                Rewrite with Mentor · +{f.gain}
              </button>
            )}
          </div>
        )
      })}

      {allFixed && (
        <div className="cvb-v2-allfixed">
          <div className="cvb-v2-allfixed-title">
            {delta > 0 ? <>All fixes applied — ▲ +{delta}</> : "No fixes open — this CV reads clean."}
          </div>
          <div className="cvb-v2-allfixed-sub">
            See your sheet in{" "}
            <button type="button" className="cvb-v2-linkbtn" onClick={onGoPreview}>Preview</button>
            , or{" "}
            <button type="button" className="cvb-v2-linkbtn" onClick={onOpenIntake}>add missing skills</button>
            {" "}from your experience.
          </div>
        </div>
      )}

      {applied.length > 0 && (
        <>
          <div className="cvb-v2-rail-group mono">Applied</div>
          {applied.map(d => (
            <button
              key={d.id}
              type="button"
              className="cvb-v2-donecard"
              onClick={() => onJump(d.iid)}
            >
              <span className="cvb-v2-donecheck">✓</span>
              <span className="cvb-v2-donetitle">{d.title}</span>
              <span className="cvb-v2-donegain mono">+{d.gain}</span>
            </button>
          ))}
        </>
      )}
    </div>
  )
}
