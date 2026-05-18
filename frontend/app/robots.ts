import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/newsletter", "/privacy", "/newsletter/rss.xml", "/newsletter/feed.json"],
        disallow: ["/api/", "/profile/"],
      },
    ],
    sitemap: "https://www.himyro.com/sitemap.xml",
  }
}
