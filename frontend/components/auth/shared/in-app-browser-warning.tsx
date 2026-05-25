"use client"

import { useEffect } from "react"
import { signupEvents } from "@/lib/analytics"
import "./auth-shared.css"

interface Props {
  agent: string
}

const AGENT_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  line: "LINE",
  wechat: "WeChat",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  twitter: "X / Twitter",
}

export function InAppBrowserWarning({ agent }: Props) {
  useEffect(() => {
    signupEvents.inAppBrowserWarningShown({ agent })
  }, [agent])

  const label = AGENT_LABEL[agent] ?? "this app"
  return (
    <div className="tm-auth-warning" role="status">
      <span aria-hidden="true">⚠</span>
      <span>
        You&apos;re inside {label}&apos;s browser. Google sign-in won&apos;t work here — use the email link
        below, or open this page in your phone&apos;s regular browser (Safari / Chrome).
      </span>
    </div>
  )
}
