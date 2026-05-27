import { create } from "zustand"

/* In-memory handoff for a CV file picked on /welcome before the user
   reaches /onboarding. The File can't survive a real reload (and shouldn't
   — re-picking is the correct fallback), so this is intentionally NOT
   persisted. /onboarding consumes it once on mount, then clears it. */

interface OnboardingHandoffState {
  cvFile: File | null
  setCVFile: (file: File) => void
  consumeCVFile: () => File | null
}

export const useOnboardingHandoff = create<OnboardingHandoffState>((set, get) => ({
  cvFile: null,
  setCVFile: (file) => set({ cvFile: file }),
  consumeCVFile: () => {
    const file = get().cvFile
    if (file) set({ cvFile: null })
    return file
  },
}))
