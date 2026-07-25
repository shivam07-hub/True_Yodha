const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js"

let loading: Promise<unknown | null> | null = null

/** Load Razorpay only after an authenticated user explicitly starts checkout. */
export function loadRazorpay<T>(): Promise<T | null> {
  if (typeof window === "undefined") return Promise.resolve(null)
  const existing = (window as unknown as { Razorpay?: T }).Razorpay
  if (existing) return Promise.resolve(existing)
  if (loading) return loading as Promise<T | null>

  loading = new Promise<unknown | null>((resolve) => {
    const script = document.createElement("script")
    script.src = CHECKOUT_SRC
    script.async = true
    script.onload = () => {
      resolve((window as unknown as { Razorpay?: unknown }).Razorpay ?? null)
    }
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
  return loading as Promise<T | null>
}
