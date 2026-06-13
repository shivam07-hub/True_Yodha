import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import Script from "next/script"
import { Providers } from "@/components/providers"
import "./globals.css"

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
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${inter.variable}`} data-accent="signal" data-surface="light">
      <body className="font-sans antialiased">
        <Script id="myro-surface-init" strategy="beforeInteractive">
          {SURFACE_INIT}
        </Script>
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${process.env.NEXT_PUBLIC_GA_ID}');`}
            </Script>
          </>
        )}
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
