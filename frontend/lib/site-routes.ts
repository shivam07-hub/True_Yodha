/**
 * Single source of truth for the public website's surfaces ("one website").
 *
 * The problem this kills: the nav, the footer, and the sitemap used to be three
 * independent hand-maintained lists, so a new public page (e.g. /companies) had
 * to be remembered in each — and silently wasn't. Consistency by discipline,
 * which rots.
 *
 * Now: declare a surface here ONCE and it flows to every place it belongs —
 * footer column, sitemap entry, public nav. The route-coverage guard
 * (scripts/ui-drift-guard.mjs) fails the build if a public `app/<seg>/page.tsx`
 * exists with no entry here, so a page can't be forgotten structurally.
 */

export type FooterColumn = "Product" | "Learn" | "Legal"
export type SitemapChangeFreq = "daily" | "weekly" | "monthly" | "yearly"
export type NavTreatment = "mail" | "grad" | "live"

export interface SiteRoute {
  /** Canonical path. May carry a #anchor for footer-only links (e.g. /docs#faq). */
  path: string
  /** Human label — used by the footer and nav unless a surface needs otherwise. */
  label: string
  /** Footer column this surface lives in. Array order below = render order. */
  footer?: FooterColumn
  /** Present → the surface appears in the public top-nav with this treatment. */
  nav?: { id: string; treatment: NavTreatment }
  /** Present → the surface is emitted as a sitemap entry. */
  sitemap?: { changeFrequency: SitemapChangeFreq; priority: number }
  /**
   * True when a real top-level `app/<seg>/page.tsx` backs this path — drives the
   * coverage guard. Omitted for anchors (/docs#faq) and the site root (/).
   */
  route?: boolean
}

/** Ordered by footer column so the footer renders in this exact order. */
export const SITE_ROUTES: SiteRoute[] = [
  // Root — sitemap only (the logo, not a footer/nav item).
  { path: "/", label: "Home", sitemap: { changeFrequency: "weekly", priority: 1 } },

  // ── Product ──────────────────────────────────────────────────────────────
  { path: "/cv-preview", label: "CV Hub", footer: "Product", sitemap: { changeFrequency: "weekly", priority: 0.7 }, route: true },
  { path: "/intel", label: "Live Job Data", footer: "Product", nav: { id: "intel", treatment: "live" }, sitemap: { changeFrequency: "daily", priority: 0.8 }, route: true },
  { path: "/companies", label: "Companies", footer: "Product", sitemap: { changeFrequency: "daily", priority: 0.7 }, route: true },
  { path: "/institutions", label: "For Colleges", footer: "Product", nav: { id: "institutions", treatment: "grad" }, sitemap: { changeFrequency: "monthly", priority: 0.7 }, route: true },
  { path: "/recruiters", label: "For Recruiters", footer: "Product", sitemap: { changeFrequency: "monthly", priority: 0.7 }, route: true },
  { path: "/referrals", label: "Referral Partners", footer: "Product", sitemap: { changeFrequency: "monthly", priority: 0.6 }, route: true },
  { path: "/myrology", label: "Myrology", footer: "Product", sitemap: { changeFrequency: "monthly", priority: 0.6 }, route: true },

  // ── Learn ────────────────────────────────────────────────────────────────
  { path: "/newsletter", label: "Newsletter", footer: "Learn", nav: { id: "newsletter", treatment: "mail" }, sitemap: { changeFrequency: "weekly", priority: 0.9 }, route: true },
  { path: "/docs", label: "How it works", footer: "Learn", sitemap: { changeFrequency: "monthly", priority: 0.9 }, route: true },
  { path: "/taxonomy", label: "Skill Taxonomy", footer: "Learn", sitemap: { changeFrequency: "monthly", priority: 0.6 }, route: true },
  // The verification surface. Daily changeFrequency because the snapshot behind
  // it rebuilds daily. The method page is a sub-route and still carries
  // `route: true`: that flag means "a real page backs this path", which the
  // sitemap test enforces for every sitemap entry — it is not a claim about
  // being top-level. It stays out of the footer; the index links to it.
  { path: "/ghost-index", label: "Ghost Job Index", footer: "Learn", sitemap: { changeFrequency: "daily", priority: 0.8 }, route: true },
  { path: "/hiring", label: "Hiring by Sector", footer: "Learn", sitemap: { changeFrequency: "daily", priority: 0.8 }, route: true },
  { path: "/ghost-index/method", label: "Ghost Job Index method", sitemap: { changeFrequency: "monthly", priority: 0.5 }, route: true },
  { path: "/docs#faq", label: "FAQ", footer: "Learn" },

  // ── Legal ────────────────────────────────────────────────────────────────
  { path: "/privacy", label: "Privacy Policy", footer: "Legal", sitemap: { changeFrequency: "yearly", priority: 0.4 }, route: true },
  { path: "/terms", label: "Terms of Use", footer: "Legal", sitemap: { changeFrequency: "yearly", priority: 0.3 }, route: true },

  // ── Public, but not a footer-column item (lives in the footer's trust strip) ─
  { path: "/security", label: "Security", sitemap: { changeFrequency: "yearly", priority: 0.4 }, route: true },
]

const FOOTER_ORDER: FooterColumn[] = ["Product", "Learn", "Legal"]

/** Footer columns, derived. Shape matches what PublicFooter renders. */
export function footerColumns(): { title: FooterColumn; links: { label: string; href: string }[] }[] {
  return FOOTER_ORDER.map((title) => ({
    title,
    links: SITE_ROUTES.filter((r) => r.footer === title).map((r) => ({ label: r.label, href: r.path })),
  }))
}

/** Surfaces that belong in the public top-nav, in registry order. */
export function navMarketingRoutes(): (SiteRoute & { nav: NonNullable<SiteRoute["nav"]> })[] {
  return SITE_ROUTES.filter((r): r is SiteRoute & { nav: NonNullable<SiteRoute["nav"]> } => !!r.nav)
}

/** Static sitemap entries (dynamic ones — issues, company pages — are added by sitemap.ts). */
export function sitemapStaticEntries(base: string) {
  return SITE_ROUTES.filter((r) => r.sitemap).map((r) => ({
    url: r.path === "/" ? base : `${base}${r.path}`,
    changeFrequency: r.sitemap!.changeFrequency,
    priority: r.sitemap!.priority,
  }))
}

/** Top-level route segments backed by a real page — the coverage-guard allowlist. */
export function publicRouteSegments(): string[] {
  return SITE_ROUTES.filter((r) => r.route).map((r) => r.path.replace(/^\//, "").split(/[/#]/)[0])
}
