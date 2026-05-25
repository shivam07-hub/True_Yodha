/**
 * In-app browser detection.
 *
 * ADR-0006 §8 — OAuth in WhatsApp / Instagram / FB / Line / WeChat fails
 * because Google blocks OAuth in embedded webviews ("disallowed_useragent").
 * We swap the Google button for "Open in browser…" + magic-link inline
 * when detected.
 *
 * UA-sniff is fragile but acceptable here: a false negative costs the user
 * one failed Google tap (followed by magic-link as fallback). A false
 * positive shows extra copy. Both are recoverable.
 */

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "instagram", re: /Instagram/i },
  { name: "facebook", re: /(FBAN|FBAV|FB_IAB)/i },
  { name: "whatsapp", re: /WhatsApp/i },
  { name: "line", re: /Line\//i },
  { name: "wechat", re: /MicroMessenger/i },
  { name: "tiktok", re: /(musical_ly|BytedanceWebview|ToutiaoMicroApp)/i },
  { name: "linkedin", re: /LinkedInApp/i },
  { name: "twitter", re: /Twitter\b/i },
]

export interface InAppBrowserDetection {
  inApp: boolean
  agent: string | null
}

export function detectInAppBrowser(ua?: string): InAppBrowserDetection {
  const value = (ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")) || ""
  for (const { name, re } of PATTERNS) {
    if (re.test(value)) return { inApp: true, agent: name }
  }
  return { inApp: false, agent: null }
}
