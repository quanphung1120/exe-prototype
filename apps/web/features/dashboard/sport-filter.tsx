"use client"

import * as React from "react"
import { ChevronDown, SlidersHorizontal } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SPORTS, type SportKey } from "@/features/dashboard/data"
import { SportDot } from "@/features/dashboard/shared"

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
function useSportOptions() {
  const tc = useTranslations("Common")
  return [
    { key: "all", label: tc("allSports") },
    ...SPORTS.map((s) => ({ key: s.key, label: tc(`sports.${s.key}`) })),
  ] as { key: SportSelection; label: string }[]
}

export function SportFilter({ className }: { className?: string }) {
  const { sport, setSport } = useSportFilter()
  const options = useSportOptions()

  const current = options.find((o) => o.key === sport) ?? options[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              "rounded-full gap-2 font-medium shadow-sm ring-1 ring-foreground/5 dark:ring-foreground/10",
              className
            )}
          >
            {sport === "all" ? (
              <SlidersHorizontal className="size-4 text-muted-foreground" />
            ) : (
              <SportDot sport={sport as SportKey} className="size-2" />
            )}
            <span>{current.label}</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuRadioGroup
          value={sport}
          onValueChange={(val) => setSport(val as SportSelection)}
        >
          {options.map((opt) => (
            <DropdownMenuRadioItem key={opt.key} value={opt.key}>
              <div className="flex items-center gap-2">
                {opt.key === "all" ? (
                  <SlidersHorizontal className="size-3.5 text-muted-foreground" />
                ) : (
                  <SportDot sport={opt.key as SportKey} className="size-2" />
                )}
                <span>{opt.label}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
