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
  description: "Upload your CV and discover your Truth Score across 10 professional domains. See exactly where you stand in the skills economy.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body className="font-sans antialiased" style={{ background: "#050A18", color: "#F0F4FF" }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
