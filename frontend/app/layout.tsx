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
 * Accent bootstrap — runs before paint to set data-accent on <html>.
 * Prevents a flash of the default (signal) accent for users on "forge".
 */
const ACCENT_BOOTSTRAP = `(function(){try{var a=localStorage.getItem('tm.accent')||'signal';document.documentElement.setAttribute('data-accent',a);}catch(e){document.documentElement.setAttribute('data-accent','signal');}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={spaceGrotesk.variable} data-accent="signal" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ACCENT_BOOTSTRAP }} />
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
