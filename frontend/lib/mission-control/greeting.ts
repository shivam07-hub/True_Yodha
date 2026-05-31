// State-aware welcome verb. The greeting reflects the user's current standing
// (momentum / progress / return / quiet) instead of only the clock. Show-not-tell:
// it states a fact about where they are, never prescribes an action. Time-based
// phrasing is the floor when no signal is strong enough to characterise the state.

export interface GreetingSignals {
  /** Practice-session day streak. */
  streak: number
  /** Score change since the last computed baseline (positive = climbed). */
  scoreDelta: number
  /** Diary/notes logged today. */
  loggedToday: boolean
  /** Local hour 0–23, for the time-based floor. Defaults to now. */
  hour?: number
}

export interface Greeting {
  text: string
  /** Single accent glyph, used sparingly (momentum only) per the 3-accent budget. */
  emoji?: string
}

function timeGreeting(hour: number): string {
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

export function adaptiveGreeting({ streak, scoreDelta, loggedToday, hour }: GreetingSignals): Greeting {
  // Priority: momentum (sustained streak) → progress (score moved up) →
  // return (any recent touch) → quiet floor (time of day).
  if (streak >= 3) return { text: "On a roll", emoji: "🔥" }
  if (scoreDelta > 0) return { text: "Trending up" }
  if (loggedToday || streak > 0) return { text: "Welcome back" }
  return { text: timeGreeting(hour ?? new Date().getHours()) }
}
