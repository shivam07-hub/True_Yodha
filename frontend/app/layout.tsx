import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import Script from "next/script"
import { Providers } from "@/components/providers"
import "./globals.css"

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
  themeColor: "#FFFFFF",
  viewportFit: "cover",
}

// Flash-free theme resolution: light is the brand default. A persisted user
// override may opt into dark mode; absent or invalid storage stays light.
const SURFACE_INIT = `(function(){try{var s=localStorage.getItem('myro-surface');if(s!=='light'&&s!=='dark'){s='light';}document.documentElement.dataset.surface=s;}catch(e){document.documentElement.dataset.surface='light';}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} data-accent="signal" data-surface="light">
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
