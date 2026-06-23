"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { CalendarRange, Users } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useVenueData } from "@/components/dashboard/venue-data-provider"
import { VenueScheduleView } from "@/components/dashboard/views/venue/schedule"
import { VenueReservationsView } from "@/components/dashboard/views/venue/reservations"

export type ScheduleTab = "calendar" | "reservations"

/**
 * The venue "Schedule" surface. The live courts×hours grid and the list of
 * incoming requests / holds / walk-ins are two views of the same thing — the
 * day's bookings — so they share one section behind a segmented toggle rather
 * than two sidebar entries. The Reservations tab carries a pending-count badge
 * so operators still see actionable requests at a glance.
 */
export function VenueScheduleWorkspace({
  initialTab = "calendar",
}: {
  initialTab?: ScheduleTab
}) {
  const t = useTranslations("VenueSchedule")
  const { reservations: RESERVATIONS } = useVenueData()
  const [tab, setTab] = React.useState<ScheduleTab>(initialTab)

  const pendingCount = RESERVATIONS.filter((r) => r.status === "pending").length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("workspaceSubtitle")}
          </p>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as ScheduleTab)}>
          <TabsList>
            <TabsTrigger value="calendar">
              <CalendarRange />
              {t("tabs.calendar")}
            </TabsTrigger>
            <TabsTrigger value="reservations">
              <Users />
              {t("tabs.reservations")}
              {pendingCount ? (
                <span className="ml-1 rounded-full bg-brand/15 px-1.5 font-mono text-[11px] font-semibold text-brand tabular-nums">
                  {pendingCount}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "calendar" ? (
        <VenueScheduleView embedded />
      ) : (
        <VenueReservationsView embedded />
      )}
    </div>
  )
}
