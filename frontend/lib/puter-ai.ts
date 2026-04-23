export type PuterRole = "system" | "user" | "assistant"

export interface PuterMessage {
  role: PuterRole
  content: string
}

type PuterChatResponse =
  | string
  | {
      message?: { content?: string } | string
      content?: string
      text?: string
      output?: unknown
    }

type PuterClient = {
  auth: {
    signIn: () => Promise<unknown>
    isSignedIn: () => boolean
  }
  ai: {
    chat: (prompt: string, options?: { model?: string }) => Promise<PuterChatResponse>
  }
}

declare global {
  interface Window {
    puter?: PuterClient
  }
}

export const PUTER_TRACKER_MODAL_SEEN_KEY = "tm-puter-chat-intro-seen-v1"

function getPuter(): PuterClient {
  if (typeof window === "undefined" || !window.puter) {
    throw new Error("Puter is not loaded yet.")
  }
  return window.puter
}

function pickText(value: unknown): string {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return ""
  const record = value as Record<string, unknown>
  for (const key of ["content", "text"]) {
    const direct = record[key]
    if (typeof direct === "string" && direct.trim()) return direct
  }
  const message = record.message
  if (typeof message === "string" && message.trim()) return message
  if (message && typeof message === "object") {
    const messageContent = (message as Record<string, unknown>).content
    if (typeof messageContent === "string" && messageContent.trim()) return messageContent
  }
  return ""
}

export function isPuterLoaded(): boolean {
  return typeof window !== "undefined" && !!window.puter
}

export function isPuterSignedIn(): boolean {
  try {
    return getPuter().auth.isSignedIn()
  } catch {
    return false
  }
}

export async function ensurePuterSignedIn(): Promise<void> {
  const puter = getPuter()
  if (!puter.auth.isSignedIn()) {
    await puter.auth.signIn()
  }
}

export function hasSeenPuterIntro(): boolean {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(PUTER_TRACKER_MODAL_SEEN_KEY) === "1"
}

export function markPuterIntroSeen(): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(PUTER_TRACKER_MODAL_SEEN_KEY, "1")
}

export function buildChatPrompt(messages: PuterMessage[], contextBlock: string): string {
  const transcript = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n")
  return `${contextBlock}\n\nConversation:\n${transcript}\n\nASSISTANT:`
}

export async function askPuter(prompt: string, model = "openai/gpt-4.1-nano"): Promise<string> {
  const puter = getPuter()
  const response = await puter.ai.chat(prompt, { model })
  const text = pickText(response).trim()
  if (!text) {
    throw new Error("Puter returned an empty response.")
  }
  return text
}
