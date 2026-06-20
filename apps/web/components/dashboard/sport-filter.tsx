"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { SPORTS, type SportKey } from "@/components/dashboard/data"
import { SportDot } from "@/components/dashboard/shared"

export type SportSelection = SportKey | "all"

interface SportFilterContextValue {
  sport: SportSelection
  setSport: (sport: SportSelection) => void
}

const SportFilterContext = React.createContext<SportFilterContextValue | null>(
  null
)

/**
 * Holds the player workspace's sport selection. Mounted once in the dashboard
 * layout so the choice persists across Overview, Match Maker and Find Courts —
 * each used to keep its own copy that reset on navigation.
 */
export function SportFilterProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [sport, setSport] = React.useState<SportSelection>("all")
  const value = React.useMemo(() => ({ sport, setSport }), [sport])
  return (
    <SportFilterContext.Provider value={value}>
      {children}
    </SportFilterContext.Provider>
  )
}

export function useSportFilter() {
  const ctx = React.useContext(SportFilterContext)
  if (!ctx) {
    throw new Error("useSportFilter must be used within a SportFilterProvider")
  }
  return ctx
}

/**
 * Compact segmented control for the topbar. Reads/writes the shared selection
 * so it stays in sync wherever the dashboard reads `useSportFilter()`.
 */
export function SportFilter({ className }: { className?: string }) {
  const { sport, setSport } = useSportFilter()
  const tc = useTranslations("Common")
  const options: { key: SportSelection; label: string }[] = [
    { key: "all", label: tc("allSports") },
    ...SPORTS.map((s) => ({ key: s.key, label: tc(`sports.${s.key}`) })),
  ]

  return (
    <div
      role="radiogroup"
      aria-label={tc("filterSport")}
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-full bg-muted/60 p-0.5",
        className
      )}
    >
      {options.map((opt) => {
        const active = sport === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.label}
            onClick={() => setSport(opt.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
              active
                ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/5"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.key === "all" ? null : (
              <SportDot sport={opt.key as SportKey} />
            )}
            <span className={cn(opt.key !== "all" && "hidden lg:inline")}>
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
