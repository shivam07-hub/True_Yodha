"use client"

import { useMyrology } from "./checkout"
import { IntakeForm, PayPanel } from "./intake-panel"
import { OrderPanel } from "./order-panel"

/** Routes the paid arc to its phase panel: details → payment → delivery. */
export function MyrologyUnlockedPanel() {
  const { phase } = useMyrology()
  if (phase === "intake") return <IntakeForm />
  if (phase === "pay") return <PayPanel />
  if (phase === "booking") return <OrderPanel />
  return null
}
