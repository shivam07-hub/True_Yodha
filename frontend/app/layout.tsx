import type { Metadata, Viewport } from "next"
import { Space_Grotesk } from "next/font/google"
import { Providers } from "@/components/providers"
import "./globals.css"

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: "Truth Mirror — Career Intelligence",
  description:
    "Upload your CV and discover your Truth Score across 10 professional domains. See exactly where you stand in the skills economy.",
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icon-512.png",   sizes: "512x512", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
}

/**
 * Theme bootstrap — runs before paint to set accent + surface on <html>.
 * Prevents flashes of default mode on refresh.
 */
const THEME_BOOTSTRAP = `(function(){try{var a=localStorage.getItem('tm.accent');var s=localStorage.getItem('tm.surface');var accent=(a==='forge'||a==='signal')?a:(s==='light'?'forge':'signal');var surface=accent==='forge'?'light':'dark';localStorage.setItem('tm.accent',accent);localStorage.setItem('tm.surface',surface);document.documentElement.setAttribute('data-accent',accent);document.documentElement.setAttribute('data-surface',surface);}catch(e){document.documentElement.setAttribute('data-accent','signal');document.documentElement.setAttribute('data-surface','dark');}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={spaceGrotesk.variable} data-accent="signal" data-surface="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
