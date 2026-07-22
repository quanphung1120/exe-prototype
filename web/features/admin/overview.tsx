"use client"

import {
  Banknote,
  BadgeCheck,
  Building2,
  CalendarClock,
  CircleDollarSign,
  RadioTower,
  Users,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { formatVnd } from "@/lib/shared"
import { VenueStat } from "@/features/venue/shared"
import type { AdminOverview } from "@/features/admin/admin-types"

export function AdminOverviewView({ overview }: { overview: AdminOverview }) {
  const t = useTranslations("AdminOverview")

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("greeting")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <VenueStat
          label={t("kpi.users")}
          value={String(overview.users)}
          icon={Users}
        />
        <VenueStat
          label={t("kpi.brands")}
          value={String(overview.brands)}
          icon={Building2}
        />
        <VenueStat
          label={t("kpi.venues")}
          value={String(overview.venues.total)}
          icon={Building2}
        />
        <VenueStat
          label={t("kpi.venuesPending")}
          value={String(overview.venues.pending)}
          icon={BadgeCheck}
          invert
        />
        <VenueStat
          label={t("kpi.bookings")}
          value={String(overview.bookings)}
          icon={CalendarClock}
        />
        <VenueStat
          label={t("kpi.grossRevenue")}
          value={formatVnd(overview.grossRevenue)}
          icon={CircleDollarSign}
        />
        <VenueStat
          label={t("kpi.activeSessions")}
          value={String(overview.activeSessions)}
          icon={RadioTower}
        />
        <VenueStat
          label={t("kpi.pendingRefunds")}
          value={String(overview.pendingRefunds)}
          icon={Banknote}
          invert
        />
      </div>
    </div>
  )
}
