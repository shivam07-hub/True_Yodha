import type { Metadata, Viewport } from "next"
import { Inter, Source_Serif_4 } from "next/font/google"
import Script from "next/script"
import { Providers } from "@/components/providers"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
})

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
})

export const metadata: Metadata = {
  metadataBase: new URL("https://www.himyro.com"),
  title: "Myro — Career Intelligence",
  description:
    "Upload your CV and discover your Myro Score across 10 professional domains. See exactly where you stand in the skills economy.",
  manifest: "/manifest.webmanifest",
  applicationName: "Myro",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Myro",
  },
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    url: "https://www.himyro.com",
    title: "Myro — Career Intelligence",
    description:
      "Upload your CV and discover your Myro Score across 10 professional domains. See exactly where you stand in the skills economy.",
    siteName: "Myro",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630, alt: "Myro — Career Intelligence" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Myro — Career Intelligence",
    description:
      "Upload your CV and discover your Myro Score across 10 professional domains. See exactly where you stand in the skills economy.",
    images: ["/brand/og-image.png"],
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
  themeColor: "#050A18",
  viewportFit: "cover",
}

/**
 * Theme bootstrap — runs before paint to set accent + surface on <html>.
 * Prevents flashes of default mode on refresh.
 */
const THEME_BOOTSTRAP = `(function(){try{var a=localStorage.getItem('tm.accent');var s=localStorage.getItem('tm.surface');var accent=(a==='forge'||a==='signal')?a:'forge';var surface=(s==='light'||s==='dark')?s:(accent==='forge'?'light':'dark');localStorage.setItem('tm.accent',accent);localStorage.setItem('tm.surface',surface);document.documentElement.setAttribute('data-accent',accent);document.documentElement.setAttribute('data-surface',surface);}catch(e){document.documentElement.setAttribute('data-accent','forge');document.documentElement.setAttribute('data-surface','light');}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable}`} data-accent="signal" data-surface="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="font-sans antialiased">
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
