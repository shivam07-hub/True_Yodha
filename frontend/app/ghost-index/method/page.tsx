import type { Metadata } from "next"
import Link from "next/link"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import "@/components/ghost-index/ghost-index.css"

/**
 * /ghost-index/method — the versioned method behind the index.
 *
 * This page is what makes a figure from the index citable: it states what was
 * measured, what was excluded and why, and what the index cannot see. It is
 * authored prose rather than generated, because a method that regenerates is a
 * method nobody can quote. When the method changes, the version changes and the
 * previous definition stays described here.
 */
const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Ghost Job Index method | Myro",
  description:
    "How the Ghost Job Index is measured: what counts as a closed role, what counts as still advertised, which evidence is excluded, and what the index cannot see.",
  alternates: { canonical: `${BASE}/ghost-index/method` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Ghost Job Index method — Myro",
    description: "What the index measures, what it excludes, and what it cannot see.",
    type: "article",
    url: `${BASE}/ghost-index/method`,
  },
}

export default function GhostIndexMethodPage() {
  return (
    <>
      <PublicTopNav />
      <article className="gi-root tm-page-enter">
        <header className="gi-head">
          <p className="gi-eyebrow">
            Method
            <span className="gi-stamp">ghost-index-v2</span>
          </p>
          <h1 className="gi-title">How the Ghost Job Index is measured</h1>
          <p className="gi-lede">
            Every figure on the{" "}
            <Link className="tm-link" href="/ghost-index">index</Link> comes from
            this definition. If we change it, the version changes with it and the
            old definition stays described below.
          </p>
        </header>

        <section className="gi-note">
          <h2 className="gi-h2">Where the listings come from</h2>
          <p>
            Myro reads job listings from employer hiring systems directly rather
            than from job boards. Each listing keeps the address it was read
            from, so it can be re-checked at that same source later.
          </p>

          <h2 className="gi-h2">The two signals</h2>
          <p>
            <b>The hiring system.</b> A verifier requests the listing at its own
            address. A listing is <b>closed</b> only on an explicit answer: the
            page is gone, or it says in words that the role is no longer open. A
            request that is blocked, rate-limited, redirected or timed out
            produces <b>no verdict</b>. An employer&apos;s system refusing our
            check is not evidence a role ended.
          </p>
          <p>
            <b>The careers feed.</b> Separately, the listing is looked for in the
            feed the employer publishes. That gives two facts: when the feed last
            carried the listing, and whether it has since stopped carrying it.
          </p>

          <h2 className="gi-h2">What counts as still advertised</h2>
          <p>
            A listing is counted as still advertised when its hiring system has
            conclusively stopped serving the role, and the employer&apos;s feed
            has never since been seen without it. The clock runs from the close
            to our most recent sighting in the feed, which makes the reported
            duration a floor rather than a total: the ad may still be up now.
          </p>
          <p>
            Only listings watched on <b>both</b> sides can be counted either way.
            That population is much smaller than the number of closed roles, and
            the index prints it beside every rate.
          </p>

          <h2 className="gi-h2">What is excluded, and why</h2>
          <p>
            Roughly half of all closure evidence ever recorded is thrown away
            before the index is computed. Between July and August 2026 our
            verifier followed a class of listing address that was missing part of
            its path. Such an address cannot reach any listing, so the &quot;not
            found&quot; it returns is a fact about the address, not about the
            role. Those records were reverted where they had affected what users
            see, and they are excluded here by a rule about the evidence itself
            rather than by date, so the same defect cannot re-enter the index if
            it recurs in another form.
          </p>

          <h2 className="gi-h2">When a figure is withheld</h2>
          <p>
            An employer or sector is published only once at least 20 of its
            closed roles have been watched on both sides. Below that, a share is
            noise wearing a percentage sign, and printing it beside a company
            name would be an accusation the evidence cannot carry. Counts are
            still published in that case; only the rate is withheld.
          </p>

          <h2 className="gi-h2">What the index cannot see</h2>
          <ul className="gi-facts">
            <li>
              <b>Intent.</b> The index reports that an ad is still up after a
              role closed. It does not and cannot say why. An oversight, a feed
              that syncs slowly, and a deliberately kept ad look identical from
              outside.
            </li>
            <li>
              <b>The employer&apos;s own timeline.</b> We know when we first saw a
              role close, not when the employer closed it. Every duration is
              measured from our observation.
            </li>
            <li>
              <b>Roles that reopened.</b> A role that closed and was later
              reposted at the same address may read as a long-standing ad.
            </li>
            <li>
              <b>Employers we do not track,</b> and every listing whose checks
              never reached a verdict. Both counts are published on the index.
            </li>
          </ul>

          <h2 className="gi-h2">Corrections</h2>
          <p>
            If a figure is wrong we will check it against the stored evidence and
            publish the correction. Write to{" "}
            <a className="tm-link" href="mailto:hello@himyro.com">hello@himyro.com</a>.
          </p>

          <h2 className="gi-h2">Version history</h2>
          <ul className="gi-facts">
            <li>
              <b>v2</b>, current. Counts a listing as still advertised only when
              the feed has never since been seen without it.
            </li>
            <li>
              <b>v1</b>, never published. Counted any feed sighting dated at or
              after the close, which our own re-check schedule made true for
              almost every listing. It measured our timing rather than the
              employer&apos;s, and was replaced before the index was released.
            </li>
          </ul>
        </section>
      </article>
      <PublicFooter />
    </>
  )
}
