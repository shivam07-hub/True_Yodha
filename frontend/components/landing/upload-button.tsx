"use client"

import { useRef } from "react"
import { useRouter } from "next/navigation"

export function UploadButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function handleFile(file: File) {
    if (!file) return
    // Store file name in sessionStorage so onboarding can pick it up
    sessionStorage.setItem("pending_cv_name", file.name)
    router.push("/onboarding")
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-sm">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full bg-primary text-primary-foreground rounded-lg px-6 py-3 text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        Upload your CV — get your score
      </button>
      <button
        onClick={() => router.push("/signup")}
        className="w-full border border-border rounded-lg px-6 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
      >
        Sign up with email
      </button>
    </div>
  )
}