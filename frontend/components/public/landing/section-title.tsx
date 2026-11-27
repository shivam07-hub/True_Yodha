import Image from "next/image"
import type { ReactNode } from "react"

/** Section heading with the Myro mark as a leading pointer. Used on every landing
 *  section, and as the page heading where a chapter is the whole page. */
export function SectionTitle({
  children,
  center = false,
  priority = false,
  as: Heading = "h2",
}: {
  children: ReactNode
  center?: boolean
  priority?: boolean
  as?: "h1" | "h2"
}) {
  return (
    <Heading className={`lp-section-title lp-section-title-mark${center ? " center" : ""}`}>
      <Image
        src="/brand/myro-mark.png"
        alt=""
        width={40}
        height={40}
        className="lp-eyebrow-logo"
        priority={priority}
      />
      <span>{children}</span>
    </Heading>
  )
}
