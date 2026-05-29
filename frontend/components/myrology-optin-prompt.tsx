"use client"

/* Shared Myrology opt-in surface used by the desktop dropdown, the mobile
 * account sheet and the Settings → Account toggle.
 *
 * Two flags, deliberately separate (see docs/MYROLOGY_INTEREST_TOGGLE.md):
 *   - myrology_interested : free, user-toggled — drives nav visibility.
 *   - myrology_unlocked   : paid ₹499 entitlement — guards routes/panel.
 *
 * Opt-in is "armed intent": the toggle/menu fires this intro+confirm prompt;
 * Confirm sets interested=true (icon appears), Cancel writes nothing.
 * Opting OUT is instant elsewhere (no prompt) — this component only confirms IN.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { Dialog, DialogContent } from "@/components/ui/dialog"

/** Read + write the free interest preference. Writes invalidate the profile
 *  query, so the nav recomputes visibility for free. */
export function useMyrologyInterest() {
  const { token } = useAuth()
  const queryClient = useQueryClient()

  const { data: profile } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })

  const mutation = useMutation({
    mutationFn: (next: boolean) => {
      if (!token) throw new Error("Session not ready — please refresh.")
      return users.updateProfile(token, { myrology_interested: next })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataKeys.profile() }),
  })

  return {
    interested: profile?.myrology_interested ?? false,
    setInterested: (next: boolean) => mutation.mutate(next),
    isPending: mutation.isPending,
  }
}

export function MyrologyOptInPrompt({
  open,
  onClose,
  onConfirmed,
}: {
  open: boolean
  onClose: () => void
  /** Fires after interest is set true (e.g. navigate to /myrology). */
  onConfirmed?: () => void
}) {
  const { setInterested, isPending } = useMyrologyInterest()

  function confirm() {
    setInterested(true)
    onClose()
    onConfirmed?.()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[420px] max-w-[calc(100%-1.5rem)] p-0 bg-transparent ring-0"
        style={{
          background: "var(--tm-surface)",
          border: "1px solid var(--tm-int-border)",
          borderRadius: "var(--tm-radius-xl)",
          boxShadow: "0 0 60px rgba(0,0,0,0.65)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "28px 26px 22px" }}>
          <div style={{ fontSize: 30, color: "var(--tm-interactive)", lineHeight: 1, marginBottom: 14 }} aria-hidden>✦</div>
          <h2 style={{ fontSize: 19, fontWeight: 700, color: "var(--tm-text)", margin: 0, lineHeight: 1.3 }}>
            Interested in following the signal from cosmos?
          </h2>
          <p style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.6, marginTop: 12 }}>
            Myrology reads your birth chart as a second signal beside your career data —
            a research-oriented astrologer reads it and you decide when to move and when to wait.
            Turn it on and Myrology joins your navigation. Switch it off anytime.
          </p>
          <p style={{ fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.55, marginTop: 10 }}>
            To read your chart we use three facts — your date, time and place of birth.
          </p>

          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              style={{
                flex: 1, padding: "10px", borderRadius: "var(--tm-radius-sm)",
                background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border)",
                color: "var(--tm-text-muted)", fontSize: 13, fontWeight: 500,
                cursor: isPending ? "not-allowed" : "pointer", fontFamily: "inherit",
              }}
            >
              Not now
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={isPending}
              style={{
                flex: 1, padding: "10px", borderRadius: "var(--tm-radius-sm)", border: "none",
                background: "var(--tm-interactive)", color: "var(--tm-interactive-fg)",
                fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.65 : 1,
                boxShadow: "0 0 18px var(--tm-int-bg-hover)",
              }}
            >
              {isPending ? "…" : "Follow the signal"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
