import Link from "next/link"
import { ArrowRight, BookOpen, Brain, ChevronRight, Compass, Flame, Globe, ShieldCheck, Sparkles, Target } from "lucide-react"
import { TruthMirrorLogo } from "@/components/truth-mirror-logo"
import { SkillGraphPreview } from "@/components/skill-graph-preview"

interface MissionContentProps {
  /** Show sign-in/sign-up CTAs — for public landing page */
  showCta?: boolean
  /** Compact variant — for the drawer */
  compact?: boolean
}

const HOW_IT_WORKS = [
  { icon: BookOpen,    step: "01", title: "Upload your CV",       body: "We extract every skill you've built across your career." },
  { icon: Globe,       step: "02", title: "We scan the market",   body: "Thousands of live job postings, parsed daily for what companies actually need." },
  { icon: Target,      step: "03", title: "See your skill map",   body: "Your skills vs market demand — ranked, scored, and honest." },
  { icon: Flame,       step: "04", title: "Log daily progress",   body: "The Career Diary captures what you learn each day and credits your skills." },
  { icon: Sparkles,    step: "05", title: "Watch your score rise", body: "Your Truth Score grows as you close the gap. Every entry counts." },
]

const VALUES = [
  {
    icon: ShieldCheck,
    title: "Signal, not noise",
    body: "We show you what companies are actually hiring for — not what feels good to hear. Radical transparency is non-negotiable.",
  },
  {
    icon: Brain,
    title: "Human skills will always matter",
    body: "AGI is reshaping every industry. We're building the map that proves human skill depth never stops being valuable.",
  },
  {
    icon: Compass,
    title: "Daily progress compounds",
    body: "One diary entry. One skill tagged. One job studied. The platform tracks it all so nothing you learn is invisible.",
  },
]

export function MissionContent({ showCta = false, compact = false }: MissionContentProps) {
  return (
    <div className="space-y-12">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="flex flex-col items-center text-center">
        <TruthMirrorLogo size="lg" className="text-primary mb-5" />
        <h1 className={`font-bold tracking-tight ${compact ? "text-2xl" : "text-4xl sm:text-5xl"}`}>
          Truth Mirror
        </h1>
        <p className={`mt-3 font-medium text-primary ${compact ? "text-base" : "text-lg sm:text-xl"}`}>
          See yourself clearly. For the first time.
        </p>
        <p className={`mt-3 text-muted-foreground max-w-lg mx-auto ${compact ? "text-sm" : "text-base"}`}>
          The intelligence platform that reads what companies are actually hiring for —
          and shows you exactly where you stand, what&apos;s missing, and what to do next.
        </p>
        {showCta && (
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Start your journey <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Already have an account <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </section>

      {/* ── The Real Problem ─────────────────────────────────── */}
      <section className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-destructive mb-3">
          The problem we&apos;re solving
        </p>
        <h2 className={`font-bold leading-snug ${compact ? "text-lg" : "text-2xl"}`}>
          The job market doesn&apos;t tell you the truth.
        </h2>
        <div className="mt-4 space-y-2.5">
          {[
            "Companies know which exact skills they're hiring for. You're guessing.",
            "AI is reshaping every role. Nobody's telling you which human skills survive.",
            "Your CV is a story. The market wants a skill map.",
          ].map((line) => (
            <p key={line} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/60" />
              {line}
            </p>
          ))}
        </div>
      </section>

      {/* ── Mission ──────────────────────────────────────────── */}
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Our mission
        </p>
        <blockquote className={`font-semibold leading-relaxed border-l-2 border-primary pl-4 ${compact ? "text-base" : "text-xl"}`}>
          Truth Mirror is the intelligence bridge between your skills and what the market
          actually needs — built on real hiring data from thousands of companies, updated daily.
        </blockquote>
        <p className="mt-4 text-sm text-muted-foreground">
          Every feature — the skill match, the diary, the score — exists to close one gap:
          the distance between where you are and where the market needs you to be.
        </p>
      </section>

      {/* ── How It Works ─────────────────────────────────────── */}
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          How it works
        </p>
        <div className="space-y-3">
          {HOW_IT_WORKS.map(({ icon: Icon, step, title, body }) => (
            <div key={step} className="flex items-start gap-4 rounded-xl border border-border p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tabular-nums text-muted-foreground/50">{step}</span>
                  <p className="text-sm font-semibold">{title}</p>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Vision + Skill Graph ──────────────────────────────── */}
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          The vision
        </p>
        <h2 className={`font-bold leading-snug ${compact ? "text-lg" : "text-2xl"}`}>
          Every person knows their exact position in the skills economy.
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Not a guess. Not a LinkedIn headline. A live, connected map of every skill you
          possess — and every skill the market is calling for next. Like an RPG skill tree,
          but built from real company hiring data. Unlock skills as you learn them.
          See exactly what to pursue next.
        </p>
        <div className="mt-5">
          <SkillGraphPreview />
        </div>
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-medium">
            In a world where AGI is reshaping every industry, the only competitive
            advantage left is knowing exactly which human skills still matter — and having
            proof that you&apos;re building them.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            That&apos;s what Truth Mirror is building. The world&apos;s most accurate,
            daily-updated map of human skill demand — sourced directly from what the
            best companies on earth are actually hiring for.
          </p>
        </div>
      </section>

      {/* ── Values ───────────────────────────────────────────── */}
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          What we stand for
        </p>
        <div className="space-y-3">
          {VALUES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-4 rounded-xl border border-border p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </span>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────── */}
      {showCta && (
        <section className="rounded-xl bg-primary p-6 text-center text-primary-foreground">
          <h2 className={`font-bold ${compact ? "text-lg" : "text-2xl"}`}>
            Look in the mirror.
          </h2>
          <p className="mt-2 text-sm opacity-80">
            See where you really stand. Then do something about it.
          </p>
          <Link
            href="/signup"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-foreground px-5 py-2.5 text-sm font-semibold text-primary hover:opacity-90 transition-opacity"
          >
            Start for free <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      )}

    </div>
  )
}
