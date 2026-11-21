"use client"

import { Button } from "@/components/ui/button"
import { MyroMark } from "@/components/myro-mark"
import { EXTENSION_WEBSTORE_URL } from "@/lib/extension"

import { ChromeGlyph } from "./chrome-glyph"

import "./extension-promo.css"

/**
 * The extension, shown doing the save: a browser on a company's careers page,
 * Myro's icon in the toolbar, its popup holding the role it read off the page.
 * The first drawing (2026-11-02) had no browser in it, so the "company page"
 * read as one more Myro card and nothing said extension. The tab, the address
 * bar and the toolbar icon are what say it. No traffic-light dots: ANTI_SLOP
 * item 14. The picture is not a control.
 *
 * pictureOnly is the onboarding door. That door already opens the store,
 * so the scene stands without a second button.
 */
export function ExtensionPromo({ pictureOnly = false }: { pictureOnly?: boolean }) {
  return (
    <div className="ext-promo">
      <div className="ext-scene" aria-hidden>
        <div className="ext-tabs">
          <span className="ext-tab">Product designer · Careers</span>
        </div>
        <div className="ext-toolbar">
          <span className="ext-url">careers.company.com/jobs/product-designer</span>
          <span className="ext-toolbar-icon"><MyroMark size={14} /></span>
        </div>
        <div className="ext-page">
          <span className="ext-role">Product designer</span>
          <span className="ext-meta">Bengaluru</span>
          <span className="ext-bar" />
          <span className="ext-bar ext-bar--short" />
        </div>
        <div className="ext-pop">
          <span className="ext-pop-brand"><MyroMark size={12} />Myro</span>
          <span className="ext-pop-title">Product designer</span>
          <span className="ext-pop-btn">Save this job</span>
        </div>
      </div>
      {!pictureOnly && (
        <Button
          className="w-full"
          size="sm"
          variant="solid"
          nativeButton={false}
          render={
            <a href={EXTENSION_WEBSTORE_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          <ChromeGlyph />
          Add to Chrome
        </Button>
      )}
    </div>
  )
}
