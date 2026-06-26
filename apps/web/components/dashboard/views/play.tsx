"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { MapPin, Plus, Users, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMatchmaking } from "@/components/dashboard/matchmaking"
import { RoomsView } from "@/components/dashboard/views/match-maker"
import { FindCourtsView } from "@/components/dashboard/views/find-courts"
import { SportFilter } from "@/components/dashboard/sport-filter"

export type PlayTab = "rooms" | "courts"

/**
 * The unified "Play" surface. Browsing open rooms and finding a court are the
 * same intent — "I want to play" — so they live behind one segmented toggle.
 * Each panel only mounts when active so they don't double-subscribe to filters.
 */
export function PlayView({ initialTab = "courts" }: { initialTab?: PlayTab }) {
  const t = useTranslations("Play")
  const tm = useTranslations("MatchMaker")
  const [tab, setTab] = React.useState<PlayTab>(initialTab)
  const { openQuickJoin, openCreateRoom } = useMatchmaking()

  return (
    <div className="flex flex-col gap-5">
      {/* Segmented toggle + contextual actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as PlayTab)}>
            <TabsList>
              <TabsTrigger value="courts">
                <MapPin />
                {t("courts")}
              </TabsTrigger>
              <TabsTrigger value="rooms">
                <Users />
                {t("rooms")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <SportFilter />
        </div>

        {tab === "rooms" ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={openQuickJoin}
            >
              <Zap />
              <span className="hidden sm:inline">{tm("findMatch")}</span>
            </Button>
            <Button size="sm" className="rounded-full" onClick={openCreateRoom}>
              <Plus />
              <span className="hidden sm:inline">{tm("createRoom")}</span>
            </Button>
          </div>
        ) : null}
      </div>

      {tab === "rooms" ? <RoomsView /> : <FindCourtsView />}
    </div>
  )
}
