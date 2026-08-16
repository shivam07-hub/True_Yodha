"use client"

/**
 * Myro is thinking — drawn, not narrated.
 *
 * It replaced the line "Myro is reading that…", which was words doing a design
 * job. Design over words: if the UI already shows a state, don't add text
 * saying it. The state here is "a reply is coming", and the honest way to show
 * that is the reply's own container, empty and alive — same background, same
 * corner, same alignment as the bubble that will replace it, so nothing shifts
 * when the answer lands.
 *
 * The words survive exactly where they are still load-bearing: `aria-label`,
 * for a reader who cannot see a dot pulse.
 */
export function MyroTyping({ label = "Myro is thinking" }: { label?: string }) {
  return (
    <div className="pf-typing" role="status" aria-label={label}>
      <span className="pf-typing-dot" aria-hidden />
      <span className="pf-typing-dot" aria-hidden />
      <span className="pf-typing-dot" aria-hidden />
    </div>
  )
}
