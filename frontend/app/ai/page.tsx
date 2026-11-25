import type { Metadata } from "next"
import Link from "next/link"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { CopyAddress } from "@/components/ai-door/copy-address"
import "@/components/ai-door/ai-door.css"

/**
 * /ai — Myro inside Claude and ChatGPT (ARCHITECTURE_MCP.md §3A, O3).
 *
 * The open door needs no sign-in, so this page is the whole setup: the
 * address, the steps each assistant documents (support.claude.com and
 * developers.openai.com, read 2026-11-24), what to ask, and what never
 * crosses. The directory listing (O4) cites this page as its documentation.
 */
const BASE = "https://www.himyro.com"
const ADDRESS = `${BASE}/mcp/open`

export const metadata: Metadata = {
  title: "Myro in Claude and ChatGPT | Myro",
  description:
    "Add Myro to Claude or ChatGPT with one address and no sign-in. Ask who is hiring, for which role, in which city, and what the role asks for.",
  alternates: { canonical: `${BASE}/ai` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Myro in Claude and ChatGPT",
    description: "Live hiring data from employer careers pages, inside your assistant. No sign-in.",
    type: "website",
    url: `${BASE}/ai`,
  },
}

const ASKS: { ask: string; answer: string; tool: string }[] = [
  { ask: "Who is hiring product managers in Bengaluru?", answer: "Live roles, each with a link to tailor your CV to it", tool: "myro_search_jobs" },
  { ask: "What skills does a data scientist role ask for?", answer: "The skills open roles list, with how many are open", tool: "myro_skills_for_role" },
  { ask: "What is Deloitte India hiring for?", answer: "Its open roles and the skills they ask for", tool: "myro_company_profile" },
  { ask: "Which skills are most asked for in Mumbai?", answer: "Skill demand by city, rising or falling", tool: "myro_skill_demand" },
  { ask: "Which sectors are hiring the most?", answer: "Live roles and top skills per sector", tool: "myro_hiring_by_sector" },
  { ask: "Which employers leave ads up after the role closes?", answer: "The Ghost Job Index, by employer", tool: "myro_ghost_jobs" },
]

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="tm-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

export default function AiDoorPage() {
  return (
    <>
      <PublicTopNav />
      <article className="ai-root tm-page-enter">
        <header className="ai-head">
          <p className="ai-eyebrow">
            Connector
            <span className="ai-stamp">no sign-in · read-only</span>
          </p>
          <h1 className="ai-title">Myro in Claude and ChatGPT</h1>
          <p className="ai-lede">
            Ask your assistant who is hiring, for which role, in which city, and
            what the role asks for. Myro answers from employer careers pages,
            read every day, and links each job back here so you can tailor your
            CV to it.
          </p>
          <CopyAddress address={ADDRESS} />
        </header>

        <section className="ai-steps" aria-label="Setup">
          <div className="ai-step-col">
            <h2 className="ai-h2">In Claude</h2>
            <ol className="ai-ol">
              <li>
                Open{" "}
                <External href="https://claude.ai/customize/connectors">Customize, then Connectors</External>.
              </li>
              <li>Choose <b>+ Add</b>, then <b>Add custom connector</b>.</li>
              <li>Name it <b>Myro</b>, paste the address, choose <b>No sign in</b>, then <b>Add</b>.</li>
              <li>In a chat, open <b>+</b>, then <b>Connectors</b>, and turn Myro on.</li>
            </ol>
            <p className="ai-aside">The Free plan holds one custom connector.</p>
          </div>

          <div className="ai-step-col">
            <h2 className="ai-h2">In ChatGPT</h2>
            <ol className="ai-ol">
              <li>
                On the web, open <External href="https://chatgpt.com/plugins">chatgpt.com/plugins</External>.
              </li>
              <li>Choose <b>+</b>, then <b>Add custom MCP server</b>.</li>
              <li>Name it <b>Myro</b>, paste the address as the <b>Server URL</b>, choose <b>No authentication</b>.</li>
              <li>Accept the risk notice, choose <b>Create as a plugin</b>, then install it.</li>
              <li>In a chat, type <b>@</b> and pick Myro.</li>
            </ol>
          </div>
        </section>

        <section className="ai-section">
          <h2 className="ai-h2">What to ask</h2>
          <div className="ai-table-wrap">
            <table className="ai-table">
              <thead>
                <tr>
                  <th scope="col">You ask</th>
                  <th scope="col">Myro answers with</th>
                </tr>
              </thead>
              <tbody>
                {ASKS.map((row) => (
                  <tr key={row.tool}>
                    <td>{row.ask}</td>
                    <td>
                      {row.answer}
                      <code className="ai-tool">{row.tool}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ai-section">
          <h2 className="ai-h2">On the website</h2>
          <p className="ai-p">
            Tailoring a CV to a job, downloading it and tracking where you applied
            happen on Myro. Every job your assistant shows carries a link to that
            job&apos;s page here.
          </p>
          <Link className="tm-link" href="/cv-preview">Score your CV</Link>
        </section>

        <section className="ai-section">
          <h2 className="ai-h2">What crosses, and what never does</h2>
          <ul className="ai-facts">
            <li>Myro receives only what your assistant passes to a tool: a role, a place, a company name. It never sees your chat.</li>
            <li>No sign-in, so the connector cannot reach a Myro account, yours or anyone&apos;s.</li>
            <li>Answers never carry a job description&apos;s text, anything about a person, or a judgement of a CV.</li>
            <li>Every tool is read-only. None changes anything, here or in your assistant.</li>
          </ul>
          <p className="ai-aside">
            More in the <Link className="tm-link" href="/privacy#what-we-collect">Privacy Policy</Link>.
            Questions: <a className="tm-link" href="mailto:hello@himyro.com">hello@himyro.com</a>.
          </p>
        </section>
      </article>
      <PublicFooter />
    </>
  )
}
