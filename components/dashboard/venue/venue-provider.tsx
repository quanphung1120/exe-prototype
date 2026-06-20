"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  VENUE_INSIGHTS,
  VENUE_STATS,
  locStr,
  type VenueInsight,
  type VenueStats,
} from "@/components/dashboard/venue/data"

// How often the "always-on" monitor surfaces the next insight (faked).
const SURFACE_MS = 9000
// How many insights are already on screen when the operator arrives.
const SEEDED = 2

interface VenueContextValue {
  /** Live KPIs — nudged when AI recommendations are applied. */
  stats: VenueStats
  /** Insights still awaiting a decision (not applied or dismissed). */
  activeInsights: VenueInsight[]
  appliedIds: Set<string>
  dismissedIds: Set<string>
  applyInsight: (id: string) => void
  dismissInsight: (id: string) => void
  /** Count of applied recommendations (for the "X actioned" stat). */
  appliedCount: number
  // ── Live feed (the always-on monitor) ──
  /** The most recently surfaced insight, for the floating dock. */
  latest: VenueInsight | null
  /** Surfaced-but-unseen insights — drives the dock badge. */
  unseenCount: number
  /** Mark the feed as seen (called when the Monitor view opens). */
  markSeen: () => void
}

const VenueContext = React.createContext<VenueContextValue | null>(null)

export function useVenue() {
  const ctx = React.useContext(VenueContext)
  if (!ctx) throw new Error("useVenue must be used within a VenueProvider.")
  return ctx
}

export function VenueProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale()
  const t = useTranslations("VenueDock")

  const [stats, setStats] = React.useState<VenueStats>(VENUE_STATS)
  const [appliedIds, setAppliedIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(
    () => new Set()
  )
  // How many insights have "arrived" so far (seeded count grows on a timer).
  const [surfaced, setSurfaced] = React.useState(SEEDED)
  const [seen, setSeen] = React.useState(SEEDED)

  // ── Always-on monitor: surface the next insight every few seconds ──
  React.useEffect(() => {
    if (surfaced >= VENUE_INSIGHTS.length) return
    const handle = setTimeout(() => {
      const next = VENUE_INSIGHTS[surfaced]
      setSurfaced((n) => n + 1)
      if (next) {
        toast(locStr(next.title, locale), {
          description: t("newInsight"),
        })
      }
    }, SURFACE_MS)
    return () => clearTimeout(handle)
  }, [surfaced, locale, t])

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
    [locale, t]
  )

  const dismissInsight = React.useCallback((id: string) => {
    setDismissedIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const markSeen = React.useCallback(() => setSeen(surfaced), [surfaced])

  const value = React.useMemo<VenueContextValue>(() => {
    const surfacedInsights = VENUE_INSIGHTS.slice(0, surfaced)
    const activeInsights = surfacedInsights.filter(
      (i) => !appliedIds.has(i.id) && !dismissedIds.has(i.id)
    )
    const latest = surfacedInsights[surfacedInsights.length - 1] ?? null
    const unseenActive = activeInsights.filter(
      (i) => VENUE_INSIGHTS.indexOf(i) >= seen
    ).length
    return {
      stats,
      activeInsights,
      appliedIds,
      dismissedIds,
      applyInsight,
      dismissInsight,
      appliedCount: appliedIds.size,
      latest,
      unseenCount: unseenActive,
      markSeen,
    }
  }, [
    stats,
    surfaced,
    seen,
    appliedIds,
    dismissedIds,
    applyInsight,
    dismissInsight,
    markSeen,
  ])

  return <VenueContext.Provider value={value}>{children}</VenueContext.Provider>
}
