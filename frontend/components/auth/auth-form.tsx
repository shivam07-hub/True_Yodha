"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/api"

interface Props {
  mode: "login" | "signup"
}

export function AuthForm({ mode }: Props) {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      const res = mode === "login"
        ? await auth.login(email, password)
        : await auth.signup(email, password, fullName)

      if (!res.access_token || res.requires_email_confirmation) {
        setNotice(res.message ?? "Check your email for a confirmation link, then sign in.")
        return
      }

      localStorage.setItem("mirror_token", res.access_token)
      router.push(mode === "login" ? "/dashboard" : "/onboarding")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          {mode === "login"
            ? "Sign in to see your Mirror Score"
            : "Start with your CV — takes 60 seconds"}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === "signup" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="full-name">Full name</label>
              <input
                id="full-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          {notice && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {mode === "login" ? (
            <>No account? <Link href="/signup" className="text-foreground underline underline-offset-2">Sign up</Link></>
          ) : (
            <>Already have an account? <Link href="/login" className="text-foreground underline underline-offset-2">Sign in</Link></>
          )}
        </p>
      </div>
    </main>
  )
}
