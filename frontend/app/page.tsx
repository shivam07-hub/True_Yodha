import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { UploadButton } from "@/components/landing/upload-button"

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border">
        <span className="text-lg font-semibold tracking-tight">Mirror</span>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <Badge variant="secondary" className="mb-6 text-xs">
          Intelligence-as-a-Service for job seekers
        </Badge>

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-2xl leading-tight mb-4">
          Know exactly where you stand in the job market
        </h1>

        <p className="text-muted-foreground text-base sm:text-lg max-w-xl mb-10">
          Upload your CV. Get your Mirror Score across 10 domains, your top 3
          matched jobs, and a 7-day action plan to close the gap.
        </p>

        <UploadButton />

        <p className="mt-4 text-xs text-muted-foreground">
          No account needed to see your score preview
        </p>
      </section>

      {/* How it works */}
      <section className="border-t border-border px-6 py-14">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-center text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-10">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Upload your CV",
                desc: "PDF or DOCX. We extract your skills and experience automatically.",
              },
              {
                step: "02",
                title: "Get your Mirror Score",
                desc: "0–100 across 10 domains. See exactly which skills are holding you back.",
              },
              {
                step: "03",
                title: "Close the gap",
                desc: "Top 3 job matches + a 7-day action plan tailored to your profile.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex flex-col gap-2">
                <span className="text-2xl font-bold text-muted-foreground/40">
                  {step}
                </span>
                <h3 className="font-semibold text-sm">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Mirror. All rights reserved.
      </footer>
    </main>
  )
}