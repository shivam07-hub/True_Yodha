import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/about",
          "/intel",
          "/newsletter",
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
          "/xp",
        ],
      },
    ],
    sitemap: "https://www.himyro.com/sitemap.xml",
  }
}
