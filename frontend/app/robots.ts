import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/intel",
          "/newsletter",
          "/institutions",
          "/docs",
          // Public marketing surface. `/myrology` MUST be listed explicitly:
          // the `Disallow: /myro` rule below is a prefix match that would
          // otherwise also block `/myrology`. A longer, more-specific Allow
          // wins under Google's longest-match precedence, so this frees the
          // public page while the authed `/myro` welcome route stays blocked.
          "/myrology",
          // Public pre-login CV scoring page. The `Disallow: /cv` rule below is a
          // prefix match that would otherwise also block `/cv-preview`; this
          // longer, more-specific Allow wins under Google's longest-match
          // precedence (same pattern as /myrology vs /myro).
          "/cv-preview",
          "/privacy",
          "/terms",
          "/newsletter/rss.xml",
          "/newsletter/feed.json",
        ],
        disallow: [
          "/api/",
          "/auth/",
          // NOTE: `/companies/` is intentionally NOT disallowed. The sitemap
          // emits every `/companies/{name}` detail page as a public SEO/job-intel
          // surface; blocking the folder here made the sitemap⊆robots contract
          // self-contradictory (Google was sent ~260 URLs it was then told not to
          // crawl → "Submitted URL blocked by robots.txt"). Detail pages are now
          // server-rendered with self-canonical metadata. Invariant enforced by
          // tests/seo-sitemap-robots.test.mjs.
          "/cv",
          "/dashboard",
          "/diary",
          "/forge",
          "/home",
          "/login",
          "/market",
          "/mission",
          "/myro",
          "/onboarding",
          "/profile/",
          "/signup",
          "/tokens",
          "/xp",
        ],
      },
    ],
    sitemap: "https://www.himyro.com/sitemap.xml",
  }
}
