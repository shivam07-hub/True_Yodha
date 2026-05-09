import { create } from "zustand"

interface DiaryIntentStore {
  open: boolean
  initialText: string
  jobId: string | null
  openDiary: (opts?: { initialText?: string; jobId?: string }) => void
  closeDiary: () => void
}

export const useDiaryIntentStore = create<DiaryIntentStore>((set) => ({
  open: false,
  initialText: "",
  jobId: null,
  openDiary: (opts) => set({ open: true, initialText: opts?.initialText ?? "", jobId: opts?.jobId ?? null }),
  closeDiary: () => set({ open: false, initialText: "", jobId: null }),
}))
