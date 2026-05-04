"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase"

export function useJobsRealtime(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("jobs-table-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["jobs-analytics"] })
          queryClient.invalidateQueries({ queryKey: ["jobs-analytics-public"] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}
