import { notFound } from "next/navigation"

import { PhoneFrameBody } from "@/components/dev/phone-frame-body"
import { parsePhoneLabSurface, parsePhoneLabTab } from "@/lib/dev/phone-lab"

export default function PhoneFramePage({
  searchParams,
}: {
  searchParams: { tab?: string; surface?: string }
}) {
  if (process.env.NODE_ENV === "production") notFound()

  return (
    <PhoneFrameBody
      tab={parsePhoneLabTab(searchParams.tab)}
      surface={parsePhoneLabSurface(searchParams.surface)}
    />
  )
}
