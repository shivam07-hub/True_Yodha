/**
 * One checkout for every order Myro sells (ARCHITECTURE_PAYMENTS.md §5).
 *
 * It opens the sale through `openSale` (the only module that loads Razorpay or
 * creates an order), verifies the payment, and maps every exit to one
 * `CheckoutOutcome`. It never rejects, so a buy button can never hang on
 * "Opening checkout…": a refused order becomes `unavailable`, a closed popup
 * `dismissed`, a grant the server has not finished `setting_up`.
 */
import { ApiError } from "@/lib/api-error"
import { billing, type BillingProduct, type RazorpayVerifyResult } from "@/lib/api"
import { openSale, type SaleResult } from "@/lib/sale"

export type CheckoutProduct = Extract<BillingProduct, "apply_pack" | "ai_workflow_audit" | "myrology" | "filing_intake">

export type CheckoutOutcome =
  | { kind: "paid"; newCoinBalance: number | null }
  | { kind: "setting_up" }
  | { kind: "dismissed" }
  | { kind: "unavailable"; reason: string }
  | { kind: "failed"; reason: string }

interface RazorpaySuccess {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  theme?: { color?: string; backdrop_color?: string }
  modal?: { confirm_close?: boolean; ondismiss?: () => void }
  handler: (response: RazorpaySuccess) => void
}

interface RazorpayInstance {
  open: () => void
  on: (event: "payment.failed", handler: (r: { error?: { description?: string; reason?: string } }) => void) => void
}

export type RazorpayCtor = new (options: RazorpayOptions) => RazorpayInstance

type OpenSale = (args: Parameters<typeof openSale<RazorpayCtor>>[0]) => Promise<SaleResult>

export interface CheckoutDeps {
  openSale: OpenSale
  verify: (token: string, payload: RazorpaySuccess) => Promise<RazorpayVerifyResult>
  key: string | undefined
}

export interface CheckoutArgs {
  token: string
  product: CheckoutProduct
  /** The job a pack is bought for; its Human Check arrives queued on it. */
  jobId?: string
  name: string
  description: string
  theme?: { color?: string; backdrop_color?: string }
}

const CONFIRM_FAILED = "We couldn't confirm the payment. If you were charged, it settles on its own."

function interactiveColour(): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = getComputedStyle(document.documentElement).getPropertyValue("--tm-interactive").trim()
  return value || undefined
}

function defaultDeps(): CheckoutDeps {
  return {
    openSale: (args) => openSale<RazorpayCtor>(args),
    verify: (token, payload) => billing.verifyPayment(token, payload),
    key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  }
}

function fromVerify(result: RazorpayVerifyResult): CheckoutOutcome {
  if ("outcome" in result) return { kind: "setting_up" }
  return { kind: "paid", newCoinBalance: result.coins_earned > 0 ? result.new_coin_balance : null }
}

export async function checkout(args: CheckoutArgs, deps: CheckoutDeps = defaultDeps()): Promise<CheckoutOutcome> {
  const key = deps.key
  if (!key) return { kind: "unavailable", reason: "Payments are not open yet." }

  let outcome: CheckoutOutcome = { kind: "dismissed" }
  try {
    const sale = await deps.openSale({
      token: args.token,
      product: args.product,
      jobId: args.jobId,
      open: ({ Razorpay, order }) =>
        new Promise<void>((resolve) => {
          let settled = false
          // Razorpay keeps its popup open after a failed attempt so the buyer
          // can retry; a failure is the outcome only if they then close it.
          let lastFailure: CheckoutOutcome | null = null
          const finish = (next: CheckoutOutcome) => {
            if (settled) return
            settled = true
            outcome = next
            resolve()
          }
          const popup = new Razorpay({
            key,
            amount: order.amount,
            currency: order.currency,
            name: args.name,
            description: args.description,
            order_id: order.order_id,
            theme: args.theme ?? { color: interactiveColour() },
            modal: { confirm_close: true, ondismiss: () => finish(lastFailure ?? { kind: "dismissed" }) },
            handler: (response) => {
              settled = true
              deps
                .verify(args.token, response)
                .then((result) => {
                  outcome = fromVerify(result)
                })
                .catch(() => {
                  outcome = { kind: "failed", reason: CONFIRM_FAILED }
                })
                .finally(resolve)
            },
          })
          popup.on("payment.failed", (r) => {
            lastFailure = { kind: "failed", reason: r.error?.description || r.error?.reason || "Payment failed. Try again." }
          })
          popup.open()
        }),
    })
    if (sale === "absent") return { kind: "unavailable", reason: "Buy on the web at himyro.com." }
    if (sale === "unavailable") return { kind: "failed", reason: "Checkout did not load. Try again." }
    return outcome
  } catch (error) {
    if (error instanceof ApiError && (error.status === 409 || error.status === 503)) {
      return { kind: "unavailable", reason: error.message }
    }
    return { kind: "failed", reason: error instanceof Error && error.message ? error.message : "Could not start checkout." }
  }
}
