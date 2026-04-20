/**
 * Truth Mirror — Tailwind brand extension
 * ──────────────────────────────────────────────────────────────────
 * Merge this into frontend/tailwind.config.ts under `theme.extend`.
 * The values pull from the CSS variables defined in design-tokens.css,
 * so Tailwind classes stay reactive to the data-accent toggle at runtime.
 *
 * Usage example:
 *   import brand from "./branding/tailwind.brand.config"
 *   export default { ...config, theme: { extend: { ...brand.extend } } }
 */

const brand = {
  extend: {
    colors: {
      // Base surfaces
      tm: {
        bg:         "var(--tm-bg)",
        surface:    "var(--tm-surface)",
        "surface-2":"var(--tm-surface-2)",
        border:     "var(--tm-border)",
        "border-soft":"var(--tm-border-soft)",

        text:       "var(--tm-text)",
        "text-muted":"var(--tm-text-muted)",
        "text-faint":"var(--tm-text-faint)",

        accent:         "var(--tm-accent)",
        "accent-hover": "var(--tm-accent-hover)",
        "accent-pressed":"var(--tm-accent-pressed)",
        "accent-wash":  "var(--tm-accent-wash)",
        "accent-ring":  "var(--tm-accent-ring)",
        "accent-fg":    "var(--tm-accent-fg)",

        success: "var(--tm-success)",
        warning: "var(--tm-warning)",
        danger:  "var(--tm-danger)",
      },
    },
    fontFamily: {
      sans: ["var(--tm-font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      mono: ["var(--tm-font-mono)", "ui-monospace", "monospace"],
    },
    fontSize: {
      display: ["var(--tm-fs-display)", { lineHeight: "var(--tm-lh-display)", letterSpacing: "var(--tm-tracking-tight)", fontWeight: "600" }],
      title:   ["var(--tm-fs-title)",   { lineHeight: "var(--tm-lh-title)",   letterSpacing: "var(--tm-tracking-tight)", fontWeight: "600" }],
      heading: ["var(--tm-fs-heading)", { lineHeight: "var(--tm-lh-heading)", fontWeight: "500" }],
      body:    ["var(--tm-fs-body)",    { lineHeight: "var(--tm-lh-body)",    fontWeight: "400" }],
      meta:    ["var(--tm-fs-meta)",    { lineHeight: "var(--tm-lh-meta)",    letterSpacing: "var(--tm-tracking-meta)", fontWeight: "500" }],
    },
    borderRadius: {
      tm:        "var(--tm-radius)",
      "tm-sm":   "var(--tm-radius-sm)",
      "tm-lg":   "var(--tm-radius-lg)",
      "tm-xl":   "var(--tm-radius-xl)",
      "tm-pill": "var(--tm-radius-pill)",
    },
    transitionTimingFunction: {
      tm: "cubic-bezier(0.16, 1, 0.3, 1)",
    },
    transitionDuration: {
      "tm-fast": "120ms",
      tm:        "200ms",
      "tm-slow": "380ms",
    },
    boxShadow: {
      "tm-1":    "var(--tm-shadow-1)",
      "tm-2":    "var(--tm-shadow-2)",
      "tm-glow": "var(--tm-shadow-glow)",
    },
    ringColor: {
      "tm-accent": "var(--tm-accent-ring)",
    },
    keyframes: {
      "tm-page-in": {
        from: { opacity: "0", transform: "translateY(4px)" },
        to:   { opacity: "1", transform: "translateY(0)" },
      },
    },
    animation: {
      "tm-page-in": "tm-page-in 380ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
    },
  },
}

export default brand
