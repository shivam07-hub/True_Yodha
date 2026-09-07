import type { ReactNode } from "react"
import "./skeleton-skins.css"

/**
 * Desktop + mobile shapes of the SAME route. CSS (not JS viewport) shows one,
 * so the first paint already matches the destination skin and a desktop
 * hydration cannot flash the phone layout.
 */
export function SkeletonSkin({
  desktop,
  mobile,
}: {
  desktop: ReactNode
  mobile: ReactNode
}) {
  return (
    <>
      <div className="tm-skel-skin tm-skel-skin--desktop">{desktop}</div>
      <div className="tm-skel-skin tm-skel-skin--mobile">{mobile}</div>
    </>
  )
}
