"use client"

import { useRouter } from "next/navigation"
import { ArrowRight, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props { title: string; company: string; tailorHref: string }

export function FirstRoleSuccess({ title, company, tailorHref }: Props) {
  const router = useRouter()
  return (
    <section className="w-full max-w-xl text-center" aria-labelledby="role-saved-title">
      <span className="mx-auto grid size-12 place-items-center rounded-full border border-[var(--tm-success-border)] bg-[var(--tm-success-wash)] text-[var(--tm-success)]"><Check className="size-6" aria-hidden="true" /></span>
      <p className="mt-5 text-sm font-semibold text-[var(--tm-interactive)]">Role saved</p>
      <h1 id="role-saved-title" className="mt-2 text-balance text-3xl font-semibold text-[var(--tm-text)]">Your first move is ready</h1>
      <p className="mt-3 text-pretty text-sm leading-6 text-[var(--tm-text-muted)]">{title}{company ? ` at ${company}` : ""} is now in Collections.</p>
      <Button size="lg" className="mt-7 min-h-12 w-full sm:w-auto" onClick={() => router.push(tailorHref)}>
        Tailor my CV for this role<ArrowRight className="size-5" />
      </Button>
    </section>
  )
}
