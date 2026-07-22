import { redirect } from "next/navigation"

/**
 * The "Welcome to Myro" hub is retired (2026-07-23). The logo now drops the user
 * in their feed (the one home), and the hub's reference cards (About us · Myro
 * Coins guide) moved into the account-menu Learn group. Any lingering /myro deep
 * link lands in the app rather than a dead welcome page.
 */
export default function MyroPage() {
  redirect("/market")
}
