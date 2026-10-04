"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { MapPin, Plus, Search, Users, X, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { useMatchmaking } from "@/features/play/matchmaking"
import { RoomsView } from "@/features/play/match-maker"
import {
  CourtFilterPanel,
  DEFAULT_COURT_FILTERS,
  FindCourtsView,
  type CourtFilterState,
} from "@/features/play/find-courts"
import { ActiveRoomPill } from "@/features/play/active-room"
import { SportFilter } from "@/features/dashboard/sport-filter"

export type PlayTab = "rooms" | "courts"

/**
 * The unified "Play" surface. Browsing open rooms and finding a court are the
 * same intent — "I want to play" — so they live behind one segmented toggle.
 * Each panel only mounts when active so they don't double-subscribe to filters.
 */
export function PlayView({ initialTab = "courts" }: { initialTab?: PlayTab }) {
  const t = useTranslations("Play")
  const tm = useTranslations("MatchMaker")
  const tf = useTranslations("FindCourts")
  const [tab, setTab] = React.useState<PlayTab>(initialTab)
  const [query, setQuery] = React.useState("")
  const [courtFilters, setCourtFilters] = React.useState<CourtFilterState>(
    DEFAULT_COURT_FILTERS
  )
  const { openQuickJoin, openCreateRoom, search } = useMatchmaking()

  return (
    <div className="player-play flex min-h-full flex-col bg-[#f6f9ff] text-foreground lg:h-full lg:overflow-hidden">
      <div
        className={cn(
          "mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 px-4 py-5 sm:px-6 lg:min-h-0 lg:px-7",
          search && "pb-32"
        )}
      >
        {/* Page header */}
        <header className="grid shrink-0 items-center gap-3 lg:grid-cols-[220px_minmax(0,1fr)_minmax(300px,0.85fr)] lg:gap-4">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-8 lg:col-span-2">
            <h1 className="font-heading text-2xl font-black tracking-tight sm:text-3xl">
              {t("metaTitle")}
            </h1>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              {t("metaDescription")}
            </p>
          </div>
          {tab === "courts" ? (
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tf("searchPlaceholder")}
                aria-label={tf("searchPlaceholder")}
                className="h-10 rounded-xl border-[#e3eafa] bg-white pr-10 pl-10 text-xs shadow-sm"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={tf("clearSearch")}
                  className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        {/* Segmented toggle + shared filters + contextual actions */}
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-5 rounded-2xl border border-[#eaf0fc] bg-white p-3.5 shadow-[0_3px_16px_#14205006] lg:min-h-0 lg:overflow-y-auto">
            <Tabs
              value={tab}
              onValueChange={(value) => {
                setTab(value as PlayTab)
                setQuery("")
              }}
            >
              <TabsList className="h-10! w-full gap-1 bg-[#f4f7fc] p-1">
                <TabsTrigger
                  value="courts"
                  className="h-full flex-1 gap-2 rounded-full px-3 text-xs font-semibold data-active:bg-brand! data-active:text-brand-foreground! data-active:shadow-sm"
                >
                  <MapPin />
                  {t("courts")}
                </TabsTrigger>
                <TabsTrigger
                  value="rooms"
                  className="h-full flex-1 gap-2 rounded-full px-3 text-xs font-semibold data-active:bg-brand! data-active:text-brand-foreground! data-active:shadow-sm"
                >
                  <Users />
                  {t("rooms")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <SportFilter className="h-10! w-full justify-between rounded-xl border-[#e3eafa] text-xs shadow-none ring-0" />

            {tab === "courts" ? (
              <div className="border-t border-[#eaf0fc] pt-4">
                <CourtFilterPanel
                  value={courtFilters}
                  onChange={setCourtFilters}
                />
              </div>
            ) : null}

            {/* Active room pill lives in the shared toolbar, visible on both
                tabs, so the manager sheet stays reachable while restyling. */}
            <ActiveRoomPill />

            {tab === "rooms" ? (
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 rounded-full px-4"
                  onClick={openQuickJoin}
                >
                  <Zap />
                  {tm("findMatch")}
                </Button>
                <Button
                  size="sm"
                  className="h-10 rounded-full bg-lime px-5 text-lime-foreground hover:bg-lime/90"
                  onClick={openCreateRoom}
                >
                  <Plus />
                  {tm("createRoom")}
                </Button>
              </div>
            ) : null}
          </aside>
          <div className="flex min-h-0 min-w-0 flex-col">
            {tab === "rooms" ? (
              <RoomsView />
            ) : (
              <FindCourtsView query={query} filters={courtFilters} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
