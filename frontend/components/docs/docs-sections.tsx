import Link from "next/link"

// ── Primitives ────────────────────────────────────────────────────────────────

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 60, scrollMarginTop: 76 }}>
      <h2 style={{ margin: "0 0 14px", fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--tm-text)" }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "0 0 12px", fontSize: 15, lineHeight: 1.75, color: "var(--tm-text-muted)" }}>
      {children}
    </p>
  )
}

export function Detail({ summary = "Technical detail", children }: { summary?: string; children: React.ReactNode }) {
  return (
    <details style={{ marginTop: 14, borderRadius: 8, border: "1px solid var(--tm-border-soft)", padding: "10px 14px", background: "var(--tm-surface)" }}>
      <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--tm-interactive)", fontFamily: "var(--tm-font-mono)", letterSpacing: "0.05em", textTransform: "uppercase", userSelect: "none" }}>
        {summary}
      </summary>
      <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.75, color: "var(--tm-text-faint)" }}>
        {children}
      </div>
    </details>
  )
}

// ── Section 1: Myro Score ─────────────────────────────────────────────────────

export function ScoringSection() {
  return (
    <Section id="scoring" title="Your Myro Score">
      <P>
        Your Myro Score is a number from 0 to 100. It reflects how comprehensively your CV
        demonstrates experience across 10 career domains — not just whether you have the right
        keywords, but how strongly you have evidenced each skill.
      </P>
      <P>
        Most professionals score between 30 and 55 when they first upload their CV. A score of
        60+ means your CV is well-rounded. 85+ means you have documented deep, results-driven
        experience across multiple domains. There is almost always room to improve by
        strengthening how your CV describes what you have done.
      </P>
      <Detail summary="Step-by-step calculation">
        <ol style={{ paddingLeft: 18, margin: "4px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong>Skill evidence</strong> — each skill found in your CV is rated by how strongly it is described (see <a href="#cv-reading" style={{ color: "var(--tm-interactive)" }}>How your CV is read</a>). Rating: 1–4.</li>
          <li><strong>Domain score</strong> — skills are grouped into one of 10 career domains. The domain score is the coverage-weighted average of evidence ratings, with a breadth bonus that rewards having many skills rather than just one strong one. Result: 0–100 per domain.</li>
          <li><strong>Myro Score</strong> — the arithmetic mean of all 10 domain scores.</li>
        </ol>
        <p style={{ marginTop: 8 }}>The 10 career domains are: Technology, Engineering, Growth, Sales, Finance, People, Design, Law, Research, and Health.</p>
      </Detail>
    </Section>
  )
}

// ── Section 2: CV reading ─────────────────────────────────────────────────────

const EVIDENCE_ROWS = [
  { label: "Listed",     pct: "25%", strength: "1/4", example: '"Proficient in Python"',                          desc: "The skill is named, but no context is given." },
  { label: "Applied",    pct: "50%", strength: "2/4", example: '"Built a data pipeline in Python"',               desc: "You describe using the skill in a real situation." },
  { label: "Proven",     pct: "75%", strength: "3/4", example: '"Reduced pipeline time by 40% using Python"',     desc: "You show a measurable result — numbers, outcomes, impact." },
  { label: "Led",       pct: "100%", strength: "4/4", example: '"Led 4 engineers building Python services"',       desc: "You directed others using this skill — managed, mentored, architected." },
]

export function CVReadingSection() {
  return (
    <Section id="cv-reading" title="How your CV is read">
      <P>
        When you upload or describe your CV, Myro scans every line and identifies skills. For
        each skill it finds, it checks how you have described it. Four levels of evidence are
        recognised — from simply listing a skill to proving it with results:
      </P>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "16px 0" }}>
        {EVIDENCE_ROWS.map(ev => (
          <div key={ev.label} style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "var(--tm-text)", minWidth: 52 }}>{ev.label}</span>
              <div style={{ flex: 1, height: 3, background: "var(--tm-hover)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: ev.pct, height: "100%", background: "var(--tm-interactive)", borderRadius: 99 }} />
              </div>
              <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)" }}>{ev.strength}</span>
            </div>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-interactive)", marginBottom: 4 }}>{ev.example}</div>
            <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>{ev.desc}</div>
          </div>
        ))}
      </div>
      <P>
        Certifications are also recognised as strong evidence (equivalent to &ldquo;Proven&rdquo;). The
        strongest evidence type found across your entire CV sets each skill&apos;s rating — so
        adding impact numbers or leadership context to any bullet point automatically upgrades
        that skill&apos;s score on your next upload.
      </P>
    </Section>
  )
}

// ── Section 3: Skill levels ───────────────────────────────────────────────────

const LEVEL_ROWS = [
  { from: "Level 0", to: "Level 1", sessions: 1,  total: "1 session total" },
  { from: "Level 1", to: "Level 2", sessions: 3,  total: "3 sessions total" },
  { from: "Level 2", to: "Level 3", sessions: 9,  total: "12 sessions total" },
  { from: "Level 3", to: "Level 4", sessions: 27, total: "36 sessions total" },
]

export function SkillLevelsSection() {
  return (
    <Section id="skill-levels" title="Skill levels">
      <P>
        Your Myro Score reflects your documented experience. Practice sessions build a separate
        layer — your active skill development. Complete 25-minute focused study sessions to
        advance your level for any skill.
      </P>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "16px 0" }}>
        {LEVEL_ROWS.map(lvl => (
          <div key={lvl.from} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 8, padding: "10px 14px" }}>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 12, color: "var(--tm-text-faint)", width: 52 }}>{lvl.from}</span>
            <span style={{ color: "var(--tm-text-faint)", fontSize: 12 }}>→</span>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 12, color: "var(--tm-interactive)", width: 52 }}>{lvl.to}</span>
            <span style={{ fontSize: 13, color: "var(--tm-text-muted)", flex: 1 }}>
              {lvl.sessions} practice session{lvl.sessions > 1 ? "s" : ""} at this level
            </span>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)" }}>{lvl.total}</span>
          </div>
        ))}
      </div>
      <P>
        Levels never expire. A partial session still accumulates — every minute counts toward
        your next threshold. You earn +50 XP for every completed session.
      </P>
    </Section>
  )
}

// ── Section 4: Job matching ───────────────────────────────────────────────────

export function MatchingSection() {
  return (
    <Section id="matching" title="Job matching">
      <P>
        Once your CV is processed, Myro searches its job database for openings that best match
        your skill profile. Matching happens in three steps:
      </P>
      <ol style={{ paddingLeft: 18, margin: "12px 0 14px", display: "flex", flexDirection: "column", gap: 10, fontSize: 15, color: "var(--tm-text-muted)", lineHeight: 1.7 }}>
        <li>
          <strong style={{ color: "var(--tm-text)" }}>Skill tagging</strong> — every job in the
          database is tagged with the skills it requires. Primary skills are core requirements;
          supporting skills are nice-to-haves.
        </li>
        <li>
          <strong style={{ color: "var(--tm-text)" }}>Overlap scoring</strong> — we count how
          many of your CV skills match each job&apos;s requirements. A higher overlap means a better
          base match.
        </li>
        <li>
          <strong style={{ color: "var(--tm-text)" }}>AI ranking</strong> — an AI model reviews
          the top candidates and re-ranks them, considering the quality of your experience, not
          just keyword count.
        </li>
      </ol>
      <P>
        Your top matches show a match percentage — this is how much of the job&apos;s required skill
        set your CV covers. A lower percentage highlights skill gaps you can close through
        practice sessions or by updating your CV.
      </P>
      <Detail summary="About the job database">
        Jobs are scraped weekly from public company career pages. We apply a minimum skill
        overlap threshold to avoid surfacing irrelevant matches, and a per-company cap
        prevents any single employer from dominating your results. The database covers 100+
        companies and is refreshed weekly.
      </Detail>
    </Section>
  )
}

// ── Section 5: XP ────────────────────────────────────────────────────────────

const EARN_ROWS = [["Welcome bonus", "+3,000 XP"], ["Practice session completed", "+50 XP"], ["Daily diary entry", "+30 XP"]]
const SPEND_ROWS = [["Refresh your job matches", "50 XP"], ["Follow a company on the heatmap", "10 XP"]]

export function XPSection() {
  return (
    <Section id="xp" title="XP & rewards">
      <P>
        XP (experience points) is Myro&apos;s activity currency. It is a permanent record of your
        engagement — XP never expires or resets.
      </P>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "16px 0" }}>
        {[{ heading: "You earn", rows: EARN_ROWS }, { heading: "You spend", rows: SPEND_ROWS }].map(col => (
          <div key={col.heading} style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontFamily: "var(--tm-font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>{col.heading}</div>
            {col.rows.map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid var(--tm-border-soft)", fontSize: 13, gap: 8 }}>
                <span style={{ color: "var(--tm-text-muted)" }}>{label}</span>
                <span style={{ fontFamily: "var(--tm-font-mono)", color: col.heading === "You earn" ? "var(--tm-success)" : "var(--tm-text-faint)", fontSize: 12, whiteSpace: "nowrap" }}>{val}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <P>
        XP is not pay-to-win. Every core feature — CV upload, skill scoring, viewing job
        matches — is free. XP gates only optional actions like triggering a fresh batch of job
        matches or building a personalised company watchlist.
      </P>
    </Section>
  )
}

// ── Section 6: Data & privacy ─────────────────────────────────────────────────

const DATA_ROWS = [
  {
    label: "Your CV",
    detail: "Uploaded or described text stored securely. Used only to compute your skill profile. Never shown to other users or employers.",
  },
  {
    label: "Job postings",
    detail: "Scraped weekly from public company career pages. We do not collect applicant data from employers.",
  },
  {
    label: "Skill taxonomy",
    detail: "Skills are mapped to an industry-standard taxonomy so your CV and job postings are compared on a level playing field. Your raw CV text stays separate.",
  },
  {
    label: "Your public profile",
    detail: "Only your 10-domain score breakdown and aggregate activity counts are visible on your public share link. Your CV, individual skill list, and email are never exposed.",
  },
]

export function DataSection() {
  return (
    <Section id="data" title="Data & privacy">
      <P>
        Myro collects the minimum data needed to serve you. We do not sell data, we do not
        require your real name, and your CV is never shared with other users or employers.
      </P>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "16px 0" }}>
        {DATA_ROWS.map(row => (
          <div key={row.label} style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>{row.label}</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-faint)", lineHeight: 1.65 }}>{row.detail}</div>
          </div>
        ))}
      </div>
      <P>
        Any email address works — throwaway, alias, anything. We do not verify identity.
        Your Myro handle is your public identity, not your name or email.
      </P>
      <Link href="/privacy" style={{ fontSize: 13, color: "var(--tm-interactive)", textDecoration: "none" }}>
        Read the full privacy policy →
      </Link>
    </Section>
  )
}
