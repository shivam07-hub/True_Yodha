"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { isAndroidApp } from "@/lib/platform/app-shell"

/** A price or a buy control. Absent inside the app, including the first paint. */
export function SaleOffer({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!isAndroidApp()) setShow(true)
  }, [])
  if (!show) return null
  return children
}

/** A page whose job is a Sale. Inside the app it goes to Jobs and paints nothing. */
export function SalePage({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (isAndroidApp()) router.replace("/market")
    else setOpen(true)
  }, [router])
  if (!open) return null
  return children
}
