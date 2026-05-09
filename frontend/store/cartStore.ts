import { create } from "zustand"
import type { CartSkill } from "@/types/xp"

interface CartStore {
  skills: CartSkill[]
  addSkill: (skill: CartSkill) => void
  removeSkill: (skillName: string) => void
  clearCart: () => void
}

export const useCartStore = create<CartStore>((set) => ({
  skills: [],
  addSkill: (skill) =>
    set((state) => ({
      skills: state.skills.some((s) => s.skill_name === skill.skill_name)
        ? state.skills
        : [...state.skills, skill],
    })),
  removeSkill: (skillName) =>
    set((state) => ({
      skills: state.skills.filter((s) => s.skill_name !== skillName),
    })),
  clearCart: () => set({ skills: [] }),
}))
