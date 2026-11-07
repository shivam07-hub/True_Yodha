/**
 * A Sale — a charge Myro collects. A salary on a job is not one.
 *
 * This is the only module that loads Razorpay or creates an order. Inside the
 * Android app it returns without either, so a new sale cannot appear by
 * copying a checkout. On the web it is the checkout the five products already
 * had.
 */
import { billing, type BillingProduct, type RazorpayOrderResponse } from "@/lib/api"
import { appShell, type AppShell } from "@/lib/platform/app-shell"
import { loadRazorpay } from "@/lib/razorpay"

export type SaleResult = "absent" | "unavailable" | "opened"

/** Routes whose job is a Sale. Opening one inside the app goes to Jobs. */
export const SALE_PATHS = [
  "/filing",
  "/job-switch-plan",
  "/preparations/audit",
  "/myrology",
] as const

export function isSalePath(pathname: string): boolean {
  return SALE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export function saleMayOpen(shell: AppShell): boolean {
  return shell === "web"
}

export async function openSale<T>(args: {
  token: string
  product: BillingProduct
  open: (loaded: { Razorpay: T; order: RazorpayOrderResponse }) => void | Promise<void>
}): Promise<SaleResult> {
  if (!saleMayOpen(appShell())) return "absent"
  const Razorpay = await loadRazorpay<T>()
  if (!Razorpay) return "unavailable"
  const order = await billing.createOrder(args.token, args.product)
  await args.open({ Razorpay, order })
  return "opened"
}
