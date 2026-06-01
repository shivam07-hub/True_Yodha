/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ];
  },
};

export default nextConfig;
