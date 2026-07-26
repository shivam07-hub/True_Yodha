import { QueryClient } from "@tanstack/react-query"

// Authenticated product state belongs in the tab's memory, not persistent
// browser storage.  This makes route changes and ordinary revisits cheap while
// preserving the privacy contract: sign-out still clears the entire client.
export const QUERY_MEMORY_POLICY = {
  staleTime: 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      ...QUERY_MEMORY_POLICY,
      retry: 1,
    },
  },
})
