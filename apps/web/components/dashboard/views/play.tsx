"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { MapPin, Plus, Sparkles, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMatchmaking } from "@/components/dashboard/matchmaking"
import { MatchMakerView } from "@/components/dashboard/views/match-maker"
import { FindCourtsView } from "@/components/dashboard/views/find-courts"

export type PlayTab = "matches" | "courts"

/**
 * The unified "Play" surface. Finding people to play with (Match Maker) and
 * finding an open court (Find Courts) are the same intent — "I want to play" —
 * so they live behind one segmented toggle instead of two sidebar entries.
 * Each panel is the original view, rendered unchanged; only the active one
 * mounts so the two don't double-subscribe to the sport filter / data.
 */
export function PlayView({ initialTab = "matches" }: { initialTab?: PlayTab }) {
  const t = useTranslations("Play")
  const tm = useTranslations("MatchMaker")
  const [tab, setTab] = React.useState<PlayTab>(initialTab)
  const { openQuickJoin, openCreateRoom } = useMatchmaking()

  return (
    <div className="flex flex-col gap-5">
      {/* Segmented toggle + the active tab's contextual actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as PlayTab)}>
          <TabsList>
            <TabsTrigger value="matches">
              <Sparkles />
              {t("matches")}
            </TabsTrigger>
            <TabsTrigger value="courts">
              <MapPin />
              {t("courts")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "matches" ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={openQuickJoin}
            >
              <Zap />
              <span className="hidden sm:inline">{tm("quickJoin")}</span>
            </Button>
            <Button size="sm" className="rounded-full" onClick={openCreateRoom}>
              <Plus />
              <span className="hidden sm:inline">{tm("createRoom")}</span>
            </Button>
          </div>
        ) : null}
      </div>

      {tab === "matches" ? <MatchMakerView /> : <FindCourtsView />}
    </div>
  )
}
