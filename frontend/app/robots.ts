import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/newsletter", "/privacy"],
        disallow: ["/api/"],
      },
    ],
    sitemap: "https://truemirror.vercel.app/sitemap.xml",
  }
}
