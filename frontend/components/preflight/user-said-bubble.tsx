"use client"

/**
 * The utterance, with the edit control ON it. A footer caption explaining
 * the edit is words doing this button's job.
 */

import { Icon } from "@/components/cv/builder/icons"

export function UserSaidBubble({
  text,
  onEdit,
}: {
  text: string
  onEdit: () => void
}) {
  return (
    <div className="pf-bubble" data-from="user">
      <span className="pf-bubble-copy">{text}</span>
      <button
        type="button"
        className="pf-bubble-edit tm-control-focus"
        aria-label="Edit what you said"
        onClick={onEdit}
      >
        <Icon name="edit" size={14} />
      </button>
    </div>
  )
}
