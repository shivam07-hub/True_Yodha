/**
 * Adding a role or a project — a fact about the person, appended as a blank
 * entry the paper can fill. One shape, so the desktop paper and the phone
 * editor cannot drift into two different blank rows.
 */
import type { CVExperienceItem, CVProjectItem, CVStructured } from "@/lib/api"

export function blankRole(): CVExperienceItem {
  return { role: "", company: "", dates: "", location: "", bullets: [""] }
}

export function blankProject(): CVProjectItem {
  return { name: "", dates: "", bullets: [""] }
}

export function withAddedRole(cv: CVStructured): CVStructured {
  return { ...cv, experience: [...cv.experience, blankRole()] }
}

export function withAddedProject(cv: CVStructured): CVStructured {
  return { ...cv, projects: [...cv.projects, blankProject()] }
}

/** An empty Projects block is a hole with an add control when the paper can
 *  be edited, and it stays reachable when sections can be reordered. A
 *  read-only render of a CV that has no projects still omits it. */
export function showProjectsSection(
  projectCount: number,
  editable: boolean,
  canReorderSections: boolean,
): boolean {
  if (projectCount > 0) return true
  return editable || canReorderSections
}
