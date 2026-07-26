import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk, Newsreader } from "next/font/google"
import { headers } from "next/headers"
import Script from "next/script"
import { Providers } from "@/components/providers"
import "./globals.css"
// Progressive-nav chrome (Myro wordmark, journey tabs/counts, live dot). Disjoint
// from globals.css's topbar rules — loaded globally here because the shared
// AuthedTopStrip renders on both the app shell and the public bar's authed view.
import "@/components/nav/nav.css"

// Space Grotesk is the core UI family site-wide (--tm-font-sans). Inter is kept
// loaded purely as the fallback in the token stack so text survives if Grotesk
// fails. The landing imported Grotesk locally before — now it is global so the
// public surface and the authed app share one type world.
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  weight: ["400", "500", "600", "700"],
  display: "swap",
})

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
})

// Editorial serif reserved for long-form READING surfaces only (newsletter
// article prose + headline). Exposed as --font-newsreader → --tm-font-reading.
// Grotesk stays the UI family; this never touches app chrome. Optical size +
// italic give the article a publication voice instead of a terminal feel.
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://www.himyro.com"),
  title: "Myro - One hub for every CV version",
  description:
    "Save your master CV, tailor versions for internships and jobs, and know which resume to send next.",
  manifest: "/manifest.webmanifest",
  applicationName: "Myro",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Myro",
  },
  robots: { index: true, follow: true },
  // OG + Twitter images are produced by app/opengraph-image.tsx (and the
  // per-profile override at app/profile/[ninja]/opengraph-image.tsx) via the
  // Next 14 file convention. Do NOT set `images:` here — the file convention
  // takes precedence only when no manual URL overrides it.
  openGraph: {
    type: "website",
    url: "https://www.himyro.com",
    title: "Myro - One hub for every CV version",
    description:
      "Save your master CV, tailor versions for internships and jobs, and know which resume to send next.",
    siteName: "Myro",
  },
  twitter: {
    card: "summary_large_image",
    title: "Myro - One hub for every CV version",
    description:
      "Save your master CV, tailor versions for internships and jobs, and know which resume to send next.",
  },
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  // Match the mobile browser chrome to the resolved surface (follow-OS default).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F9F9F9" },
    { media: "(prefers-color-scheme: dark)", color: "#191918" },
  ],
  viewportFit: "cover",
}

// Flash-free theme resolution, single source of truth = the `myro-surface`
// key owned by lib/hooks/use-surface.ts:
//   "light" | "dark"  → explicit user override (honored verbatim)
//   absent / invalid   → follow the OS (prefers-color-scheme)
// This MUST match use-surface's default (system), or a no-pref visitor on a
// dark OS flashes light-then-dark. Runs beforeInteractive so the resolved
// surface is on <html> before first paint; `color-scheme` is set too so native
// form controls / scrollbars match.
const SURFACE_INIT = `(function(){try{var s=localStorage.getItem('myro-surface');if(s!=='light'&&s!=='dark'){s=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var d=document.documentElement;d.dataset.surface=s;d.style.colorScheme=s;}catch(e){document.documentElement.dataset.surface='light';}})();`

// Flash-free accent resolution (backlog ND15) — mirrors SURFACE_INIT. Source
// of truth = the `myro-accent` localStorage key owned by lib/hooks/use-accent.ts.
// Absent/invalid → "signal" (the default every existing user already sees).
const ACCENT_INIT = `(function(){try{var a=localStorage.getItem('myro-accent');document.documentElement.dataset.accent=(a==='forge')?'forge':'signal';}catch(e){document.documentElement.dataset.accent='signal';}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = headers().get("x-nonce") ?? undefined

  return (
    <html
      lang="en"
      className={`${grotesk.variable} ${inter.variable} ${newsreader.variable}`}
      data-accent="signal"
      data-surface="light"
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <Script id="myro-surface-init" strategy="beforeInteractive" nonce={nonce}>
          {SURFACE_INIT}
        </Script>
        <Script id="myro-accent-init" strategy="beforeInteractive" nonce={nonce}>
          {ACCENT_INIT}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
