"use client"

import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MyroMark } from "@/components/myro-mark"
import { EXTENSION_WEBSTORE_URL } from "@/lib/extension"

import "./extension-promo.css"

/**
 * The extension, shown doing the save. A text link under the pool counts
 * never said what the click does. This is the popup on a job page, then
 * the store button. The picture is not a control.
 *
 * pictureOnly is the onboarding door. That door already opens the store,
 * so the scene stands without a second button.
 */
export function ExtensionPromo({ pictureOnly = false }: { pictureOnly?: boolean }) {
  return (
    <div className="ext-promo">
      <div className="ext-scene" aria-hidden>
        <div className="ext-page">
          <span className="ext-kicker">Company page</span>
          <span className="ext-role">Product designer</span>
          <span className="ext-meta">Bengaluru</span>
          <span className="ext-bar" />
          <span className="ext-bar ext-bar--short" />
        </div>
        <div className="ext-pop">
          <div className="ext-pop-head">
            <MyroMark size={16} />
            <span>
              <span className="ext-pop-brand">Myro</span>
              <span className="ext-pop-title">Save this job</span>
            </span>
          </div>
          <span className="ext-pop-btn">Save this job</span>
        </div>
      </div>
      {!pictureOnly && (
        <Button
          className="w-full"
          size="sm"
          variant="solid"
          render={
            <a href={EXTENSION_WEBSTORE_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          Add jobs as you browse
          <ArrowRight size={13} aria-hidden />
        </Button>
      )}
    </div>
  )
}
