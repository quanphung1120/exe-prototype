"use client"

import * as React from "react"
import { Check, SlidersHorizontal } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
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
function useSportOptions() {
  const tc = useTranslations("Common")
  return [
    { key: "all", label: tc("allSports") },
    ...SPORTS.map((s) => ({ key: s.key, label: tc(`sports.${s.key}`) })),
  ] as { key: SportSelection; label: string }[]
}

export function SportFilter({ className }: { className?: string }) {
  const { sport, setSport } = useSportFilter()
  const tc = useTranslations("Common")
  const options = useSportOptions()

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

/**
 * Mobile affordance for the same shared selection: a compact trigger that opens
 * a bottom sheet of sport options. Used where the segmented `SportFilter` is too
 * wide for the topbar (below `sm`).
 */
export function SportFilterSheet({ className }: { className?: string }) {
  const { sport, setSport } = useSportFilter()
  const tc = useTranslations("Common")
  const options = useSportOptions()
  const [open, setOpen] = React.useState(false)
  const current = options.find((o) => o.key === sport) ?? options[0]

  const choose = (key: SportSelection) => {
    setSport(key)
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={tc("filterSport")}
            className={cn("shrink-0", className)}
          />
        }
      >
        {sport === "all" ? (
          <SlidersHorizontal className="size-4" />
        ) : (
          <SportDot sport={sport as SportKey} className="size-2" />
        )}
        <span>{current.label}</span>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="pb-2">
          <SheetTitle>{tc("filterSport")}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-3 pb-3">
          {options.map((opt) => {
            const active = opt.key === sport
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => choose(opt.key)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-3 text-left text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                )}
              >
                {opt.key === "all" ? (
                  <SlidersHorizontal className="size-4 shrink-0" />
                ) : (
                  <SportDot sport={opt.key as SportKey} className="size-2" />
                )}
                <span className="flex-1">{opt.label}</span>
                {active ? (
                  <Check className="size-4 shrink-0 text-brand" />
                ) : null}
              </button>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}
