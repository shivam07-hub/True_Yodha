import { ArrowUpRight } from "lucide-react"

import { EXTENSION_WEBSTORE_URL } from "@/lib/extension"

import { ChromeGlyph } from "./chrome-glyph"

import "./extension-promo.css"

/**
 * The extension as the last way into Add a job, under link, file and paste.
 * Someone who opened the dialog has a job in hand; the store is a detour, so
 * it sits last and quiet. It names Chrome and the extension in words: the
 * picture it replaced never said either. Same two lines as the phone sheet.
 */
export function ExtensionRow() {
  return (
    <a className="ext-row" href={EXTENSION_WEBSTORE_URL} target="_blank" rel="noopener noreferrer">
      <ChromeGlyph size={18} />
      <span className="ext-row-text">
        <span className="ext-row-title">Chrome extension</span>
        <span className="ext-row-sub">Save from any job board in one click</span>
      </span>
      <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
    </a>
  )
}
