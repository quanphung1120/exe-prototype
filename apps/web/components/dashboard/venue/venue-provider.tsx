"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  locStr,
  type VenueInsight,
  type VenueStats,
} from "@/components/dashboard/venue/data"
import { useData } from "@/components/dashboard/data-provider"

interface VenueContextValue {
  /** Live KPIs — nudged when AI pricing recommendations are applied. */
  stats: VenueStats
  /**
   * Adaptive-pricing moves still awaiting a decision — only simple raise/lower
   * price recommendations (those carrying a `priceMove`).
   */
  priceSuggestions: VenueInsight[]
  appliedIds: Set<string>
  dismissedIds: Set<string>
  applyInsight: (id: string) => void
  dismissInsight: (id: string) => void
  /** Count of applied recommendations (for the "X applied" stat). */
  appliedCount: number
}

const VenueContext = React.createContext<VenueContextValue | null>(null)

export function useVenue() {
  const ctx = React.useContext(VenueContext)
  if (!ctx) throw new Error("useVenue must be used within a VenueProvider.")
  return ctx
}

export function VenueProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale()
  const t = useTranslations("VenuePricing")
  const { venueInsights: VENUE_INSIGHTS, venueStats: VENUE_STATS } = useData()

  const [stats, setStats] = React.useState<VenueStats>(VENUE_STATS)
  const [appliedIds, setAppliedIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(
    () => new Set()
  )

  const applyInsight = React.useCallback(
    (id: string) => {
      const insight = VENUE_INSIGHTS.find((i) => i.id === id)
      if (!insight) return
      setAppliedIds((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev)
        next.add(id)
        return next
      })
      if (insight.effect) {
        const { metric, delta } = insight.effect
        setStats((prev) => ({ ...prev, [metric]: prev[metric] + delta }))
      }
      toast.success(t("applied"), {
        description: locStr(insight.action, locale),
      })
    },
    [locale, t, VENUE_INSIGHTS]
  )

  const dismissInsight = React.useCallback((id: string) => {
    setDismissedIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const value = React.useMemo<VenueContextValue>(() => {
    const priceSuggestions = VENUE_INSIGHTS.filter(
      (i) => i.priceMove && !appliedIds.has(i.id) && !dismissedIds.has(i.id)
    )
    return {
      stats,
      priceSuggestions,
      appliedIds,
      dismissedIds,
      applyInsight,
      dismissInsight,
      appliedCount: appliedIds.size,
    }
  }, [
    stats,
    appliedIds,
    dismissedIds,
    applyInsight,
    dismissInsight,
    VENUE_INSIGHTS,
  ])

  return <VenueContext.Provider value={value}>{children}</VenueContext.Provider>
}

/**
 * Remounts {@link VenueProvider} whenever the active venue changes, so the
 * applied-pricing state (nudged KPIs, dismissed suggestions) resets to the new
 * venue rather than carrying the previous one's decisions across a switch.
 */
export function VenueWorkspaceProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { activeVenueId } = useData()
  return <VenueProvider key={activeVenueId}>{children}</VenueProvider>
}
