import { notFound } from "next/navigation"

import { PhoneLab } from "@/components/dev/phone-lab"
import {
  parsePhoneLabMode,
  parsePhoneLabSurface,
  parsePhoneLabTab,
} from "@/lib/dev/phone-lab"

export default function PhoneLabPage({
  searchParams,
}: {
  searchParams: { tab?: string; mode?: string; surface?: string }
}) {
  if (process.env.NODE_ENV === "production") notFound()

  return (
    <PhoneLab
      tab={parsePhoneLabTab(searchParams.tab)}
      mode={parsePhoneLabMode(searchParams.mode)}
      surface={parsePhoneLabSurface(searchParams.surface)}
    />
  )
}
