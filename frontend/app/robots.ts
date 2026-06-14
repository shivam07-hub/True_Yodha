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
          "/privacy",
          "/terms",
          "/newsletter/rss.xml",
          "/newsletter/feed.json",
        ],
        disallow: [
          "/api/",
          "/auth/",
          "/companies/",
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
