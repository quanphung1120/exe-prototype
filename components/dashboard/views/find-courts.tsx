"use client"

import * as React from "react"
import { Clock, MapPin, Star } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  COURTS,
  SPORTS,
  formatVnd,
  type Court,
  type SportKey,
} from "@/components/dashboard/data"
import { SportTag } from "@/components/dashboard/shared"

// Decorative pin positions for the mini map (percent of panel box).
const PINS = [
  { top: "22%", left: "28%" },
  { top: "44%", left: "62%" },
  { top: "30%", left: "78%" },
  { top: "68%", left: "38%" },
  { top: "58%", left: "18%" },
  { top: "76%", left: "72%" },
]

export function FindCourtsView() {
  const [sport, setSport] = React.useState<SportKey | "all">("all")
  const courts = COURTS.filter(
    (c) => sport === "all" || c.sports.includes(sport)
  )

  return (
    <div className="flex flex-col gap-5">
      <Tabs value={sport} onValueChange={(v) => setSport(v as SportKey | "all")}>
        <TabsList variant="line" className="flex-wrap">
          <TabsTrigger value="all">All sports</TabsTrigger>
          {SPORTS.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          {courts.map((c) => (
            <CourtCard key={c.id} court={c} />
          ))}
          {!courts.length ? (
            <p className="rounded-4xl bg-card px-4 py-16 text-center text-sm text-muted-foreground shadow-md ring-1 ring-foreground/5 sm:col-span-2 dark:ring-foreground/10">
              No courts for this sport nearby. Try another filter.
            </p>
          ) : null}
        </div>

        {/* Mini map */}
        <div className="lg:sticky lg:top-2 lg:h-fit">
          <div className="relative aspect-square overflow-hidden rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
            <div className="bg-court-lines absolute inset-0" />
            <div className="absolute inset-0 bg-gradient-to-br from-brand/5 via-transparent to-lime/10" />
            <div className="absolute top-4 left-4 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
              Nearby · {courts.length} courts
            </div>
            {courts.map((c, i) => {
              const pos = PINS[i % PINS.length]
              return (
                <div
                  key={c.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ top: pos.top, left: pos.left }}
                >
                  <div className="flex flex-col items-center">
                    <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background shadow-sm tabular-nums">
                      {formatVnd(c.pricePerHour)}
                    </span>
                    <span className="-mt-0.5 size-2 rotate-45 bg-foreground" />
                  </div>
                </div>
              )
            })}
            {/* "You are here" */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <span className="relative flex size-3">
                <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/60" />
                <span className="relative inline-flex size-3 rounded-full bg-brand ring-2 ring-card" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CourtCard({ court }: { court: Court }) {
  return (
    <div className="flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 transition-shadow hover:shadow-lg dark:ring-foreground/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-heading text-lg font-semibold">
            {court.name}
          </p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {court.district} · {court.distanceKm} km
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground tabular-nums">
          <Star className="size-3 fill-lime text-lime" />
          {court.rating}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {court.sports.map((s) => (
          <SportTag key={s} sport={s} />
        ))}
        <span className="text-xs text-muted-foreground">· {court.surface}</span>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {court.openSlots} slots open today
          </span>
          <span className="font-mono font-semibold tabular-nums">
            {court.freePct}% free
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full bg-gradient-to-r from-lime to-brand")}
            style={{ width: `${court.freePct}%` }}
          />
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-4">
        <div>
          <span className="font-heading text-xl font-bold tabular-nums">
            {formatVnd(court.pricePerHour)}
          </span>
          <span className="text-xs text-muted-foreground">/hour</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 font-mono tabular-nums">
            <Clock className="size-3" />
            {court.nextSlot}
          </Badge>
          <Button size="sm" className="rounded-full">
            Book
          </Button>
        </div>
      </div>
    </div>
  )
}
