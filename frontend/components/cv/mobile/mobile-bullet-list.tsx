"use client"

import { useState } from "react"
import { BulletRewrite } from "@/components/cv/builder/bullet-rewrite"
import { Icon } from "@/components/cv/builder/icons"
import { Button } from "@/components/ui/button"
import { moveItem } from "./mobile-cv-model"

interface MobileBulletListProps {
  token: string
  role: string
  bullets: string[]
  onChange: (bullets: string[]) => void
}

export function MobileBulletList({ token, role, bullets, onChange }: MobileBulletListProps) {
  const [editing, setEditing] = useState<number | null>(null)
  const [removed, setRemoved] = useState<{ value: string; index: number } | null>(null)

  function replace(index: number, value: string) {
    const next = [...bullets]
    next[index] = value
    onChange(next)
  }

  function remove(index: number) {
    setRemoved({ value: bullets[index], index })
    onChange(bullets.filter((_, itemIndex) => itemIndex !== index))
    setEditing(null)
  }

  function undoRemove() {
    if (!removed) return
    const next = [...bullets]
    next.splice(removed.index, 0, removed.value)
    onChange(next)
    setRemoved(null)
  }

  return (
    <div className="tm-mcv-bullets">
      <h4>Achievements</h4>
      {bullets.map((bullet, index) => (
        <article key={`${index}-${bullet.slice(0, 18)}`} className="tm-mcv-bullet">
          <div className="tm-mcv-bullet-order" aria-label={`Move bullet ${index + 1}`}>
            <button
              type="button"
              aria-label="Move bullet up"
              disabled={index === 0}
              onClick={() => onChange(moveItem(bullets, index, -1))}
            >
              <Icon name="chevron-down" size={16} style={{ transform: "rotate(180deg)" }} />
            </button>
            <button
              type="button"
              aria-label="Move bullet down"
              disabled={index === bullets.length - 1}
              onClick={() => onChange(moveItem(bullets, index, 1))}
            >
              <Icon name="chevron-down" size={16} />
            </button>
          </div>

          <div className="tm-mcv-bullet-main">
            {editing === index ? (
              <label className="tm-mcv-field">
                <span className="sr-only">Bullet {index + 1}</span>
                <textarea
                  rows={4}
                  autoFocus
                  value={bullet}
                  onChange={event => replace(index, event.target.value)}
                />
              </label>
            ) : (
              <p>{bullet || "Empty bullet"}</p>
            )}

            <div className="tm-mcv-bullet-actions">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setEditing(editing === index ? null : index)}
              >
                <Icon name={editing === index ? "check" : "edit"} />
                {editing === index ? "Done" : "Edit"}
              </Button>
              <BulletRewrite
                token={token}
                bullet={bullet}
                role={role}
                missingKeywords={[]}
                onApply={(_, proposed) => replace(index, proposed)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-md"
                aria-label={`Delete bullet ${index + 1}`}
                onClick={() => remove(index)}
              >
                <Icon name="trash" />
              </Button>
            </div>
          </div>
        </article>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="md"
        onClick={() => {
          onChange([...bullets, ""])
          setEditing(bullets.length)
        }}
      >
        <Icon name="plus" /> Add bullet
      </Button>

      {removed && (
        <div className="tm-mcv-undo" role="status">
          <span>Bullet removed</span>
          <button type="button" onClick={undoRemove}>Undo</button>
        </div>
      )}
    </div>
  )
}
