"use client"

import { useQuery } from "@tanstack/react-query"

import { billing, type Catalogue, type CatalogueProduct, type BillingProduct } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { formatCount } from "@/lib/format"

/** Every buy button renders from this: no price, no button (ARCHITECTURE_PAYMENTS.md §5). */
export function useCatalogue() {
  return useQuery({
    queryKey: dataKeys.catalogue(),
    queryFn: () => billing.catalogue(),
    staleTime: 60 * 1000,
  })
}

/** The product a button may offer, or null when the server would refuse it. */
export function sellable(catalogue: Catalogue | undefined, alias: BillingProduct): CatalogueProduct | null {
  const product = catalogue?.products.find((p) => p.alias === alias)
  return product && product.available ? product : null
}

/** ₹199 from 19900 paise. */
export function rupees(paise: number): string {
  return `₹${formatCount(Math.round(paise / 100))}`
}
