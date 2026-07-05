/**
 * RestructuredDoc — presents a flat CV text (the Mentor restructure proposal) as
 * a document with real hierarchy: uppercase section headers, bold role/company
 * lines, and proper bullet lists. It NEVER edits the text — it only classifies
 * each line so the preview reads like a CV instead of a wall of monospace.
 *
 * Shared by the authed RestructureProposal and the public PublicPlayground so
 * both restructure surfaces look identical (one product). The Keep/save payload
 * stays the raw `text` the caller holds — this is presentation only.
 */

type Block =
  | { t: "head"; text: string }
  | { t: "sub"; text: string }
  | { t: "para"; text: string }
  | { t: "bullets"; items: string[] }

const KNOWN_HEADS = new Set([
  "SUMMARY", "PROFILE", "OBJECTIVE", "ABOUT",
  "EXPERIENCE", "WORK EXPERIENCE", "PROFESSIONAL EXPERIENCE", "EMPLOYMENT",
  "EDUCATION", "SKILLS", "TECHNICAL SKILLS", "CORE SKILLS", "KEY SKILLS",
  "PROJECTS", "CERTIFICATIONS", "CERTIFICATES", "ACHIEVEMENTS", "AWARDS",
  "PUBLICATIONS", "LANGUAGES", "INTERESTS", "VOLUNTEER", "CONTACT",
])

// A short, fully-uppercase line with no sentence punctuation reads as a section
// header even when it isn't in the known set (e.g. "KEY ACHIEVEMENTS").
function isHead(line: string): boolean {
  if (KNOWN_HEADS.has(line.toUpperCase())) return true
  return (
    line.length <= 34 &&
    line === line.toUpperCase() &&
    /[A-Z]/.test(line) &&
    !/[.:;]/.test(line)
  )
}

// A role/company/dates line — carries a 4-digit year and stays short. Gives the
// entry its own weight so bullets read as its children, not siblings of the head.
function isSub(line: string): boolean {
  return line.length <= 96 && /\b(19|20)\d{2}\b/.test(line) && !/^[•\-*·]/.test(line)
}

function parse(text: string): Block[] {
  const blocks: Block[] = []
  let bullets: string[] = []
  const flush = () => {
    if (bullets.length) { blocks.push({ t: "bullets", items: bullets }); bullets = [] }
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    if (/^[•\-*·]\s+/.test(line)) { bullets.push(line.replace(/^[•\-*·]\s+/, "")); continue }
    flush()
    if (isHead(line)) blocks.push({ t: "head", text: line })
    else if (isSub(line)) blocks.push({ t: "sub", text: line })
    else blocks.push({ t: "para", text: line })
  }
  flush()
  return blocks
}

export function RestructuredDoc({ text }: { text: string }) {
  const blocks = parse(text)
  return (
    <div className="cvb-rs-doc">
      {blocks.map((b, i) => {
        if (b.t === "head") return <h4 key={i} className="cvb-rs-doc-h">{b.text}</h4>
        if (b.t === "sub") return <p key={i} className="cvb-rs-doc-sub">{b.text}</p>
        if (b.t === "bullets") {
          return (
            <ul key={i} className="cvb-rs-doc-ul">
              {b.items.map((it, j) => <li key={j}>{it}</li>)}
            </ul>
          )
        }
        return <p key={i} className="cvb-rs-doc-p">{b.text}</p>
      })}
    </div>
  )
}
