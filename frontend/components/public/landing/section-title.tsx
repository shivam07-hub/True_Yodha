import Image from "next/image"
import type { ReactNode } from "react"

/** Section heading with the Myro mark as a leading pointer. Used on every landing section. */
export function SectionTitle({
  children,
  center = false,
  priority = false,
}: {
  children: ReactNode
  center?: boolean
  priority?: boolean
}) {
  return (
    <h2 className={`lp-section-title lp-section-title-mark${center ? " center" : ""}`}>
      <Image
        src="/brand/myro-mark.png"
        alt=""
        width={40}
        height={40}
        className="lp-eyebrow-logo"
        priority={priority}
      />
      <span>{children}</span>
    </h2>
  )
}
