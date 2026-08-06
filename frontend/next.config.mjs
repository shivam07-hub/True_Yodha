/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          },
        ],
      },
    ]
  },

  // Tracker → CV merge (grill 2026-06-02). /tracker is gone; its surface is now
  // the "CV & Applications" workspace at /cv. Redirect preserves bookmarks + the
  // diary deep-link shim + any future emailed stale-recovery link, mapping old
  // query state onto the new lens/filter scheme. Most-specific rule first;
  // permanent:false because the semantics moved, not the content disappeared.
  async redirects() {
    return [
      {
        // Old Verdicts tab → the Closed filter. (By-stage/By-company lens was
        // dropped in the lens-collapse pass, so ?stage maps to the default view.)
        source: "/tracker",
        has: [{ type: "query", key: "tab", value: "verdicts" }],
        destination: "/cv?filter=closed",
        permanent: false,
      },
      {
        source: "/tracker",
        destination: "/cv",
        permanent: false,
      },
      {
        // Forge became Practice everywhere a user reads it (2026-05-25 vocab
        // lock, applied 2026-08-06); the URL was the last surface still saying
        // Forge. Query state carries over untouched — ?skill= and ?view= mean
        // the same thing on the renamed route. permanent:true, the old path is
        // retired.
        source: "/forge",
        destination: "/practice",
        permanent: true,
      },
      {
        // /about was a redirect-only alias used as the "home" target + indexed in
        // the sitemap at priority 1. The alias is gone (logo/links now point at /
        // directly); this 301 preserves inbound/bookmarked /about links and passes
        // equity to the real homepage. permanent:true — the URL is retired for good.
        source: "/about",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
