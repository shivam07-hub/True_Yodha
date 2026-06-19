import type { CVContact, CVStructured } from "@/lib/api"
import type { UserProfile } from "@/lib/api"
import type { PdfPageContact } from "@/components/cv/builder/pdf-page"

export type MobileCVSection =
  | "contact"
  | "summary"
  | "experience"
  | "projects"
  | "skills"
  | "education"
  | "certifications"

export const EMPTY_CONTACT: CVContact = {
  name: "",
  title: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
}

export function withContact(cv: CVStructured): CVStructured {
  return {
    ...cv,
    contact: { ...EMPTY_CONTACT, ...(cv.contact ?? {}) },
  }
}

export function previewContact(cv: CVStructured, profile: UserProfile | null): PdfPageContact {
  const contact = { ...EMPTY_CONTACT, ...(cv.contact ?? {}) }
  return {
    name: contact.name.trim() || profile?.full_name?.trim() || "Your name",
    title: contact.title.trim() || cv.experience[0]?.role || "",
    email: contact.email.trim(),
    phone: contact.phone.trim(),
    location: contact.location.trim() || profile?.target_location || "",
    linkedin: contact.linkedin.trim() || profile?.linkedin_url || "",
  }
}

export function sectionSummary(section: MobileCVSection, cv: CVStructured): string {
  if (section === "contact") {
    const count = Object.values(cv.contact ?? EMPTY_CONTACT).filter(value => value.trim()).length
    return count === 1 ? "1 detail" : `${count} details`
  }
  if (section === "summary") return cv.summary?.trim() ? "Added" : "Empty"
  if (section === "experience") return `${cv.experience.length} ${cv.experience.length === 1 ? "role" : "roles"}`
  if (section === "projects") return `${cv.projects.length} ${cv.projects.length === 1 ? "project" : "projects"}`
  if (section === "skills") {
    const count = (cv.skills_line ?? "").split(/[,|]/).filter(value => value.trim()).length
    return `${count} ${count === 1 ? "skill" : "skills"}`
  }
  if (section === "education") return `${cv.education.length} ${cv.education.length === 1 ? "entry" : "entries"}`
  return `${cv.certs.length} ${cv.certs.length === 1 ? "certification" : "certifications"}`
}

export function moveItem<T>(items: T[], from: number, direction: -1 | 1): T[] {
  const to = from + direction
  if (to < 0 || to >= items.length) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
