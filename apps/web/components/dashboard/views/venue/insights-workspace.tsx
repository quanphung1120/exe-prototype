"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { BarChart3, Users } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VenueAnalyticsView } from "@/components/dashboard/views/venue/analytics"
import { VenueCustomersView } from "@/components/dashboard/views/venue/customers"

export type InsightsTab = "performance" | "players"

/**
 * The venue "Insights" surface. Revenue / utilization / demand analytics and
 * the player roster (regulars, retention, reach) are both "how is the business
 * doing" — so they share one section behind a segmented toggle instead of the
 * old Analytics + Players sidebar pair.
 */
export function VenueInsightsWorkspace({
  initialTab = "performance",
}: {
  initialTab?: InsightsTab
}) {
  const t = useTranslations("VenueInsights")
  const [tab, setTab] = React.useState<InsightsTab>(initialTab)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as InsightsTab)}>
          <TabsList>
            <TabsTrigger value="performance">
              <BarChart3 />
              {t("tabs.performance")}
            </TabsTrigger>
            <TabsTrigger value="players">
              <Users />
              {t("tabs.players")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "performance" ? (
        <VenueAnalyticsView embedded />
      ) : (
        <VenueCustomersView embedded />
      )}
    </div>
  )
}
