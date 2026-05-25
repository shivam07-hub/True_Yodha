import type { Config } from "tailwindcss"

/**
 * Myro Tailwind config
 * ────────────────────────────────────────────────────────────
 * Tokens live in app/design-tokens.css. This config exposes
 * them as Tailwind utilities so components can opt into either
 * the token-driven classes (text-display, bg-tm-surface, etc.)
 * or the existing shadcn `hsl(var(--...))` classes.
 */

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "var(--tm-font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--tm-font-sans)", "Georgia", "serif"],
        mono: ["var(--tm-font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        display: ["var(--tm-fs-display)", { lineHeight: "var(--tm-lh-display)", letterSpacing: "var(--tm-tracking-tight)", fontWeight: "600" }],
        title:   ["var(--tm-fs-title)",   { lineHeight: "var(--tm-lh-title)",   letterSpacing: "var(--tm-tracking-tight)", fontWeight: "600" }],
        heading: ["var(--tm-fs-heading)", { lineHeight: "var(--tm-lh-heading)", fontWeight: "500" }],
        body:    ["var(--tm-fs-body)",    { lineHeight: "var(--tm-lh-body)",    fontWeight: "400" }],
        meta:    ["var(--tm-fs-meta)",    { lineHeight: "var(--tm-lh-meta)",    letterSpacing: "var(--tm-tracking-meta)", fontWeight: "500" }],
      },
      colors: {
        /* ── shadcn/ui compatibility (existing components keep working) */
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        /* ── Myro token palette (accent-reactive) */
        tm: {
          bg:              "var(--tm-bg)",
          surface:         "var(--tm-surface)",
          "surface-2":     "var(--tm-surface-2)",
          border:          "var(--tm-border)",
          "border-soft":   "var(--tm-border-soft)",

          text:            "var(--tm-text)",
          "text-muted":    "var(--tm-text-muted)",
          "text-faint":    "var(--tm-text-faint)",

          brand:           "var(--tm-brand)",
          "brand-glow":    "var(--tm-brand-glow)",
          "brand-fg":      "var(--tm-brand-fg)",

          interactive:        "var(--tm-interactive)",
          "interactive-hover":"var(--tm-interactive-hover)",
          "interactive-press":"var(--tm-interactive-press)",
          "interactive-wash": "var(--tm-interactive-wash)",
          "interactive-ring": "var(--tm-interactive-ring)",
          "interactive-fg":   "var(--tm-interactive-fg)",

          "int-bg-subtle":   "var(--tm-int-bg-subtle)",
          "int-bg-wash":     "var(--tm-int-bg-wash)",
          "int-bg-hover":    "var(--tm-int-bg-hover)",
          "int-border-soft": "var(--tm-int-border-soft)",
          "int-border":      "var(--tm-int-border)",
          "int-solid":       "var(--tm-int-solid)",
          "int-solid-hover": "var(--tm-int-solid-hover)",
          "int-text":        "var(--tm-int-text)",
          "int-text-strong": "var(--tm-int-text-strong)",

          "data-1": "var(--data-1)",
          "data-2": "var(--data-2)",
          "data-3": "var(--data-3)",
          "data-4": "var(--data-4)",
          "data-5": "var(--data-5)",
          "data-6": "var(--data-6)",

          accent:          "var(--tm-accent)",
          "accent-hover":  "var(--tm-accent-hover)",
          "accent-pressed":"var(--tm-accent-pressed)",
          "accent-wash":   "var(--tm-accent-wash)",
          "accent-ring":   "var(--tm-accent-ring)",
          "accent-fg":     "var(--tm-accent-fg)",

          success: "var(--tm-success)",
          warning: "var(--tm-warning)",
          danger:  "var(--tm-danger)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "tm-page-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "tm-page-in": "tm-page-in 380ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
    },
  },
  plugins: [],
}

export default config
