"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link } from "@/i18n/navigation"
import {
  ArrowDownRight,
  ArrowUpRight,
  Crown,
  Send,
  Sparkles,
  TrendingDown,
  Trophy,
  Users,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  customerTierAccent,
  formatVnd,
  locStr,
  type CustomerTier,
  type VenueCustomer,
} from "@/components/dashboard/venue/data"
import { useData } from "@/components/dashboard/data-provider"
import {
  MicroLabel,
  Ring,
  VenueEmpty,
  VenuePanel,
} from "@/components/dashboard/venue/shared"
import { SportTag } from "@/components/dashboard/shared"

type Segment = "all" | CustomerTier

const SEGMENTS: Segment[] = ["all", "vip", "regular", "new", "at-risk"]

const RANK_RING = ["text-lime", "text-brand", "text-chart-3"]

export function VenueCustomersView() {
  const t = useTranslations("VenueCustomers")
  const locale = useLocale()
  const { venueCustomers: VENUE_CUSTOMERS } = useData()
  const [segment, setSegment] = React.useState<Segment>("all")

  const total = VENUE_CUSTOMERS.length
  const vipCount = VENUE_CUSTOMERS.filter((c) => c.tier === "vip").length
  const atRisk = VENUE_CUSTOMERS.filter((c) => c.tier === "at-risk")
  const atRiskCount = atRisk.length

  const countFor = React.useCallback(
    (seg: Segment) =>
      seg === "all"
        ? total
        : VENUE_CUSTOMERS.filter((c) => c.tier === seg).length,
    [total, VENUE_CUSTOMERS]
  )

  const rows = React.useMemo(
    () =>
      VENUE_CUSTOMERS.filter(
        (c) => segment === "all" || c.tier === segment
      ).slice(),
    [segment, VENUE_CUSTOMERS]
  )

  const leaders = React.useMemo(
    () => [...VENUE_CUSTOMERS].sort((a, b) => b.ltv - a.ltv).slice(0, 3),
    [VENUE_CUSTOMERS]
  )
  const topLtv = leaders[0]?.ltv ?? 1

  const tierLabel = (tier: CustomerTier) => t(`tiers.${tier}`)

  const sendWinBack = (name: string) =>
    toast.success(t("winBackSent"), { description: t("winBackDesc", { name }) })

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Total customers */}
        <div className="flex flex-col gap-3 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
          <div className="flex items-center justify-between">
            <MicroLabel>{t("summary.total")}</MicroLabel>
            <Users className="size-4 text-muted-foreground/70" />
          </div>
          <span className="font-heading text-4xl leading-none font-bold tracking-tight tabular-nums">
            {total}
          </span>
          <p className="text-xs text-muted-foreground">
            {t("summary.totalNote")}
          </p>
        </div>

        {/* VIP count */}
        <div className="flex flex-col gap-3 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
          <div className="flex items-center justify-between">
            <MicroLabel>{t("summary.vip")}</MicroLabel>
            <Crown className="size-4 text-muted-foreground/70" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-4xl leading-none font-bold tracking-tight tabular-nums">
              {vipCount}
            </span>
            <span className="text-sm font-medium text-muted-foreground tabular-nums">
              {t("summary.vipShare", {
                pct: Math.round((vipCount / total) * 100),
              })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("summary.vipNote")}
          </p>
        </div>

        {/* At-risk — AI win-back callout */}
        <Link
          href="/dashboard/venue/monitor"
          className="group relative flex flex-col gap-3 overflow-hidden rounded-4xl bg-card p-5 shadow-md ring-1 ring-destructive/20 transition-shadow hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring dark:ring-destructive/25"
        >
          <div className="pointer-events-none absolute -top-10 -right-8 size-32 rounded-full bg-destructive/10 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <MicroLabel className="text-destructive/80">
              {t("summary.atRisk")}
            </MicroLabel>
            <span className="inline-flex items-center gap-1 rounded-full bg-lime/20 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-brand uppercase">
              <Sparkles className="size-3" />
              {t("summary.aiTag")}
            </span>
          </div>
          <div className="relative flex items-baseline gap-2">
            <span className="font-heading text-4xl leading-none font-bold tracking-tight text-destructive tabular-nums">
              {atRiskCount}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              {t("summary.atRiskUnit", { count: atRiskCount })}
            </span>
          </div>
          <p className="relative inline-flex items-center gap-1 text-xs font-medium text-brand">
            {t("summary.winBackCta")}
            <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </p>
        </Link>
      </div>

      {/* Customer list */}
      <VenuePanel
        title={t("listTitle")}
        icon={Users}
        action={
          <Tabs value={segment} onValueChange={(v) => setSegment(v as Segment)}>
            <TabsList variant="line" className="flex-wrap">
              {SEGMENTS.map((seg) => (
                <TabsTrigger key={seg} value={seg}>
                  {t(`segments.${seg}`)}
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                    {countFor(seg)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      >
        {rows.length ? (
          <div className="-mx-1 overflow-x-auto">
            <div className="min-w-[760px] px-1">
              {/* Column header */}
              <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_72px_minmax(0,1fr)_104px_88px] items-center gap-3 border-b border-border/60 px-3 pb-2">
                <MicroLabel>{t("col.customer")}</MicroLabel>
                <MicroLabel>{t("col.sport")}</MicroLabel>
                <MicroLabel className="text-right">
                  {t("col.visits")}
                </MicroLabel>
                <MicroLabel>{t("col.lastVisit")}</MicroLabel>
                <MicroLabel className="text-right">{t("col.ltv")}</MicroLabel>
                <MicroLabel className="text-right">
                  {t("col.noShow")}
                </MicroLabel>
              </div>

              <div className="flex flex-col">
                {rows.map((c) => (
                  <CustomerRow
                    key={c.id}
                    c={c}
                    locale={locale}
                    tierLabel={tierLabel}
                    visitsLabel={(n) => t("visitsUnit", { count: n })}
                    noShowLabel={t("noShowSuffix")}
                    winBackLabel={t("sendWinBack")}
                    onWinBack={() => sendWinBack(c.name)}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <VenueEmpty text={t("empty")} />
        )}
      </VenuePanel>

      {/* Top players by value */}
      <VenuePanel title={t("leaderTitle")} icon={Trophy}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {leaders.map((c, i) => (
            <div
              key={c.id}
              className="flex items-center gap-4 rounded-3xl bg-muted/40 p-4 transition-colors hover:bg-muted/70"
            >
              <Ring
                pct={Math.round((c.ltv / topLtv) * 100)}
                size={56}
                thickness={6}
                ringClassName={RANK_RING[i] ?? "text-brand"}
              >
                <span className="font-heading text-lg leading-none font-bold tabular-nums">
                  {i + 1}
                </span>
              </Ring>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{c.name}</span>
                  <TierChip tier={c.tier} label={tierLabel(c.tier)} />
                </div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="font-heading text-xl font-bold tracking-tight text-brand tabular-nums">
                    {formatVnd(c.ltv)}
                  </span>
                  <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    {t("col.ltv")}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </VenuePanel>
    </div>
  )
}

function TierChip({ tier, label }: { tier: CustomerTier; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        customerTierAccent[tier]
      )}
    >
      {label}
    </span>
  )
}

function CustomerRow({
  c,
  locale,
  tierLabel,
  visitsLabel,
  noShowLabel,
  winBackLabel,
  onWinBack,
}: {
  c: VenueCustomer
  locale: string
  tierLabel: (tier: CustomerTier) => string
  visitsLabel: (n: number) => string
  noShowLabel: string
  winBackLabel: string
  onWinBack: () => void
}) {
  const atRisk = c.tier === "at-risk"
  const trendUp = c.trend >= 0
  const flat = c.trend === 0

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_72px_minmax(0,1fr)_104px_88px] items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors",
        atRisk
          ? "bg-destructive/[0.04] hover:bg-destructive/[0.08]"
          : "hover:bg-muted/60"
      )}
    >
      {/* Customer */}
      <div className="flex min-w-0 items-center gap-3">
        <Avatar>
          <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
            {c.initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{c.name}</span>
            <TierChip tier={c.tier} label={tierLabel(c.tier)} />
          </div>
          {atRisk ? (
            <button
              type="button"
              onClick={onWinBack}
              className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-brand transition-colors hover:text-brand/80"
            >
              <Send className="size-3" />
              {winBackLabel}
            </button>
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {visitsLabel(c.visits)}
            </span>
          )}
        </div>
      </div>

      {/* Sport */}
      <div className="min-w-0">
        <SportTag sport={c.favoriteSport} />
      </div>

      {/* Visits */}
      <span className="text-right font-heading text-sm font-semibold tabular-nums">
        {c.visits}
      </span>

      {/* Last visit + trend */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm text-muted-foreground">
          {locStr(c.lastVisit, locale)}
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums",
            flat
              ? "text-muted-foreground"
              : trendUp
                ? "text-brand"
                : "text-destructive"
          )}
        >
          {flat ? (
            <TrendingDown className="size-3.5 opacity-40" />
          ) : trendUp ? (
            <ArrowUpRight className="size-3.5" />
          ) : (
            <ArrowDownRight className="size-3.5" />
          )}
          {flat ? "—" : `${trendUp ? "+" : ""}${c.trend}%`}
        </span>
      </div>

      {/* LTV */}
      <span className="text-right font-heading text-sm font-semibold text-brand tabular-nums">
        {formatVnd(c.ltv)}
      </span>

      {/* No-show rate */}
      <span
        className={cn(
          "text-right text-sm font-medium tabular-nums",
          c.noShowRate >= 15
            ? "text-destructive"
            : c.noShowRate > 0
              ? "text-muted-foreground"
              : "text-muted-foreground/50"
        )}
      >
        {c.noShowRate}
        <span className="text-[11px] text-muted-foreground/70">
          {noShowLabel}
        </span>
      </span>
    </div>
  )
}
