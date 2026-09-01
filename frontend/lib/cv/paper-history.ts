/**
 * Paper undo — hide/show, line edit, structural reorder.
 *
 * Cmd+Z in a field stays native. Toolbar arrows and Cmd+Z on the workstation
 * walk this stack. Tailor Take/Keep undo lives on the overlay Back control.
 */
"use client"

import { useCallback, useRef, useState } from "react"
import type { CVStructured } from "@/lib/api"

export interface PaperCmd {
  apply: () => void
  revert: () => void
}

export function usePaperHistory() {
  const past = useRef<PaperCmd[]>([])
  const future = useRef<PaperCmd[]>([])
  const [, bump] = useState(0)

  const record = useCallback((cmd: PaperCmd) => {
    past.current.push(cmd)
    future.current = []
    bump(n => n + 1)
  }, [])

  const undo = useCallback(() => {
    const cmd = past.current.pop()
    if (!cmd) return
    cmd.revert()
    future.current.push(cmd)
    bump(n => n + 1)
  }, [])

  const redo = useCallback(() => {
    const cmd = future.current.pop()
    if (!cmd) return
    cmd.apply()
    past.current.push(cmd)
    bump(n => n + 1)
  }, [])

  return {
    record,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  }
}

/** Reorder / add / drop — not identity or education field typing. */
export function isPaperStructureChange(before: CVStructured, after: CVStructured): boolean {
  if (sigRoles(before.experience) !== sigRoles(after.experience)) return true
  if (sigProjects(before.projects) !== sigProjects(after.projects)) return true
  if (before.education.length !== after.education.length) return true
  if (before.certs.join("\0") !== after.certs.join("\0")) return true
  return false
}

function sigRoles(experience: CVStructured["experience"]): string {
  return experience.map(e => `${e.role}\t${e.company}\t${e.bullets.join("\n")}`).join("\0")
}

function sigProjects(projects: CVStructured["projects"]): string {
  return projects.map(p => `${p.name}\t${p.bullets.join("\n")}`).join("\0")
}
