# Myro Design Constitution
### One-page rulebook for every UI decision · v1.0 · 2026-05-09

This document exists because we shipped the Skill Intelligence page with the
Domain Inspector rendered ~600px below the cards that triggered it — separated
by a full-viewport canvas. Cause and effect divorced. We never want this class
of mistake again.

These five rules are the litmus test. Every PR that touches UI must include the
line **"Constitution check: rules 1–5 ✓"** in its description, with a one-sentence
note for any rule that needed care. If a design violates any rule, redesign the
layout — do not exile the detail.

---

## Rule 1 · Causal Proximity

**A user's action and the result it produces must render within one viewport,
ideally adjacent. The result must be visually tethered to its trigger
(border colour, accent line, expansion-from-origin, or shared container).**

> Why: if the user clicks something and the result appears 600px away, they
> believe nothing happened. They scroll, find an orphan panel, and have to
> reconstruct causality in their head. That cognitive cost is a tax we charge
> on every interaction.

**Pass:** Click a domain card → an Inspector panel expands directly below the
card strip, framed in the same accent colour. No scroll required.

**Fail:** Click a domain card → Inspector appears below a 560px graph canvas.
User scrolls, wonders if they clicked the right thing.

---

## Rule 2 · Single Frame of Truth

**When the user makes a selection, every component on screen must reflect it.
The card highlights, the canvas filters, the inspector populates — all at once,
all coherent. No orphan components that ignore the active state.**

> Why: a selection is a question the user asked the page. The page either
> answers with its whole self or it confuses. Half-reactive UIs feel broken
> even when they work.

**Pass:** User selects "Analysis" domain. Card lights up. Canvas dims non-Analysis
nodes. Inspector shows Analysis skills. One narrative, three surfaces.

**Fail:** User selects "Analysis". Card lights up. Canvas keeps showing all
domains as if nothing happened. Inspector floats below, disconnected.

---

## Rule 3 · Reversible by the Same Gesture

**The action that opens a thing closes it. The action that selects deselects.
A user should never have to hunt for an exit button when they triggered the
state with a click.**

> Why: every "find the X" is a small failure of memory. The hand that opened
> should be the hand that closes.

**Pass:** Clicking a domain card opens the Inspector. Clicking the same card
closes it. (An explicit Close button is fine, but never required.)

**Fail:** Clicking opens. Only an explicit ✕ closes. Card click after open
becomes a no-op or, worse, a re-trigger.

---

## Rule 4 · Progressive, Not Appended

**New detail must expand from the trigger — inline, in place, in context.
It must not be appended to the bottom of the page just because there is
unused vertical space down there.**

> Why: "appended at the bottom" is the lazy answer to "where does this go?"
> It is what we did with Domain Inspector. It is the source of every Rule 1
> violation. The honest answer to "where does this go?" is: where the user
> is looking when they trigger it.

**Pass:** Inspector lives in the slot between Domain Strip and Canvas. When
no domain is selected, that slot collapses to zero height. When selected,
it expands smoothly, pushing the canvas down by exactly its content height.

**Fail:** Inspector rendered after the canvas. "There was room there."

---

## Rule 5 · No Invisible State Change

**If the application's state changed, the viewport must show that change
within 200ms — without scroll, without page navigation, with a transition
the eye can follow.**

> Why: invisible state changes cause double-clicks, frustrated reloads, and
> support tickets. Animations are not decoration; they are the receipt the
> system gives the user that says "I heard you."

**Pass:** Click a card → 200ms ease-out: card glows, Inspector grows from
0 height to its natural height, canvas re-renders with dimmed non-selected
nodes. The change is one continuous motion.

**Fail:** Click a card → Inspector appears instantly with no animation,
canvas does nothing, user is unsure if anything actually happened.

---

## How to use this document

1. Before you start a UI change, re-read the five rules.
2. While designing, sketch the action → result path. Are they adjacent?
3. While building, animate every state transition you introduce.
4. Before you open the PR, walk through your change once with the rules in mind.
5. In the PR description, write: `Constitution check: rules 1–5 ✓` and call
   out any rule that needed careful handling.

If a rule feels wrong for a specific case, **propose an amendment**, do not
silently break it. This document is meant to evolve, but only deliberately.

---

## Amendments log

_None yet._
