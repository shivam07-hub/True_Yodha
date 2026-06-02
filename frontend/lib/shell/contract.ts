import type { UserProfile } from "@/lib/api"

/**
 * Neutral shell contract — shared by the web shell (components/app-shell) and
 * the mobile shell (mobile/shell), so neither platform imports the other.
 * Breaking the former web↔mobile import cycle (ADR-0010).
 *
 * The shape of profile data the chrome surfaces (top bar, profile sheet) need.
 */
export type SidebarProfile = Pick<
  UserProfile,
  "full_name" | "target_roles" | "target_location" | "target_locations" | "linkedin_url" | "email"
>
