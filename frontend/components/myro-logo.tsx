import Image from "next/image"
import type { CSSProperties } from "react"

interface MyroLogoProps {
  size?: "sm" | "md" | "lg" | number
  className?: string
  decorative?: boolean
  style?: CSSProperties
}

const sizes = { sm: 20, md: 32, lg: 64 }

export function MyroLogo({ size = "md", className = "", decorative = false, style }: MyroLogoProps) {
  const px = typeof size === "number" ? size : sizes[size]

  return (
    <Image
      src="/brand/aperture-m.png"
      alt={decorative ? "" : "Myro"}
      aria-hidden={decorative || undefined}
      title="Myro"
      width={px}
      height={px}
      className={className}
      style={{
        width: px,
        height: px,
        borderRadius: "24%",
        display: "block",
        objectFit: "cover",
        ...style,
      }}
    />
  )
}
