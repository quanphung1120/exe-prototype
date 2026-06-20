"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  Banknote,
  Check,
  CheckCheck,
  ChevronDown,
  CloudRain,
  Flame,
  HeartHandshake,
  Sparkles,
  TrendingDown,
  UserX,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  MicroLabel,
  VenuePanel,
  VenueEmpty,
} from "@/components/dashboard/venue/shared"
import { useVenue } from "@/components/dashboard/venue/venue-provider"
import { useData } from "@/components/dashboard/data-provider"
import {
  locList,
  locStr,
  severityAccent,
  type InsightKind,
  type InsightSeverity,
  type VenueInsight,
} from "@/components/dashboard/venue/data"

// Map each AI insight kind to a lucide glyph (kept on-palette via the chip).
const KIND_ICON: Record<InsightKind, LucideIcon> = {
  "demand-surge": Flame,
  underutilized: TrendingDown,
  "no-show-risk": UserX,
  maintenance: Wrench,
  revenue: Banknote,
  retention: HeartHandshake,
  weather: CloudRain,
}

// Severity ordering for the filter chips + the "critical" headline count.
const SEVERITIES: InsightSeverity[] = ["critical", "warn", "info"]

type Filter = InsightSeverity | "all"

export function VenueMonitorView() {
  const t = useTranslations("VenueMonitor")
  const locale = useLocale()
  const { venue: VENUE, venueInsights: VENUE_INSIGHTS } = useData()
  const {
    activeInsights,
    appliedIds,
    applyInsight,
    dismissInsight,
    appliedCount,
    markSeen,
  } = useVenue()

  const [filter, setFilter] = React.useState<Filter>("all")
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set())

  // Mark the feed as seen on mount — scheduled so the setState doesn't run
  // synchronously inside the effect (repo lint forbids that).
  React.useEffect(() => {
    const id = setTimeout(markSeen, 0)
    return () => clearTimeout(id)
  }, [markSeen])

  const toggleExpanded = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Headline figures conveying an always-on monitor.
  const criticalCount = activeInsights.filter(
    (i) => i.severity === "critical"
  ).length
  const counts: Record<InsightSeverity, number> = {
    critical: criticalCount,
    warn: activeInsights.filter((i) => i.severity === "warn").length,
    info: activeInsights.filter((i) => i.severity === "info").length,
  }

  const shown =
    filter === "all"
      ? activeInsights
      : activeInsights.filter((i) => i.severity === filter)

  // Resolved feed — applied insights, newest decisions first.
  const resolved = VENUE_INSIGHTS.filter((i) => appliedIds.has(i.id))

  return (
    <div className="flex flex-col gap-5">
      {/* Live header */}
      <section className="relative overflow-hidden rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 sm:p-6 dark:ring-foreground/10">
        <div
          aria-hidden
          className="bg-court-lines pointer-events-none absolute inset-0 [mask-image:radial-gradient(120%_120%_at_88%_0%,#000_0%,transparent_60%)] opacity-70"
        />
        <div className="absolute -top-16 -right-16 size-48 rounded-full bg-brand/15 blur-3xl" />
        <div className="relative flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                <span className="relative flex size-2">
                  <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/60" />
                  <span className="relative inline-flex size-2 rounded-full bg-brand" />
                </span>
                {t("live")}
              </span>
              <h1 className="font-heading text-3xl font-bold tracking-tight">
                {t("title")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("watching", { count: VENUE.sports.length * 3 })}
              </p>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-lime to-brand text-brand-foreground shadow-sm">
              <Sparkles className="size-5" />
            </span>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <HeaderStat label={t("statActive")} value={activeInsights.length} />
            <HeaderStat
              label={t("statCritical")}
              value={criticalCount}
              tone={criticalCount > 0 ? "warn" : "muted"}
            />
            <HeaderStat label={t("statApplied")} value={appliedCount} />
          </div>
        </div>
      </section>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          count={activeInsights.length}
        >
          {t("filterAll")}
        </FilterChip>
        {SEVERITIES.map((s) => (
          <FilterChip
            key={s}
            active={filter === s}
            onClick={() => setFilter(s)}
            count={counts[s]}
            dotClassName={severityAccent[s].dot}
          >
            {t(`severity.${s}`)}
          </FilterChip>
        ))}
      </div>

      {/* The feed */}
      <VenuePanel
        title={t("feedTitle")}
        icon={Sparkles}
        action={<MicroLabel>{t("feedCaption")}</MicroLabel>}
      >
        {shown.length ? (
          <div className="flex flex-col gap-3">
            {shown.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                locale={locale}
                expanded={expanded.has(insight.id)}
                onToggle={() => toggleExpanded(insight.id)}
                onApply={() => applyInsight(insight.id)}
                onDismiss={() => dismissInsight(insight.id)}
                t={t}
              />
            ))}
          </div>
        ) : activeInsights.length ? (
          <VenueEmpty text={t("emptyFilter")} />
        ) : (
          <AllClear t={t} />
        )}
      </VenuePanel>

      {/* Resolved */}
      {resolved.length ? (
        <VenuePanel
          title={t("resolvedTitle")}
          icon={CheckCheck}
          action={
            <span className="font-mono text-[11px] tracking-wider text-brand uppercase tabular-nums">
              {t("resolvedCount", { count: resolved.length })}
            </span>
          }
        >
          <ul className="flex flex-col gap-1">
            {resolved.map((insight) => (
              <li
                key={insight.id}
                className="flex items-center gap-3 rounded-3xl px-2 py-2 transition-colors hover:bg-muted/60"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand/12 text-brand">
                  <Check className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {locStr(insight.title, locale)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {locStr(insight.action, locale)}
                  </p>
                </div>
                <span className="hidden shrink-0 rounded-full bg-lime/20 px-2.5 py-1 text-xs font-semibold text-brand tabular-nums sm:inline-flex">
                  {locStr(insight.impact, locale)}
                </span>
              </li>
            ))}
          </ul>
        </VenuePanel>
      ) : null}
    </div>
  )
}

/** A compact figure in the live header. */
function HeaderStat({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: number
  tone?: "default" | "warn" | "muted"
}) {
  return (
    <div className="flex flex-col gap-1 rounded-3xl bg-background/60 p-4 ring-1 ring-foreground/5 backdrop-blur-sm dark:ring-foreground/10">
      <MicroLabel>{label}</MicroLabel>
      <span
        className={cn(
          "font-heading text-3xl leading-none font-bold tracking-tight tabular-nums",
          tone === "warn" && "text-destructive",
          tone === "muted" && "text-muted-foreground"
        )}
      >
        {value}
      </span>
    </div>
  )
}

/** Severity / scope filter pill. */
function FilterChip({
  active,
  onClick,
  count,
  dotClassName,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  dotClassName?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-brand text-brand-foreground"
          : "bg-secondary text-secondary-foreground hover:bg-muted"
      )}
    >
      {dotClassName ? (
        <span className={cn("size-1.5 rounded-full", dotClassName)} />
      ) : null}
      {children}
      <span
        className={cn(
          "tabular-nums",
          active ? "text-brand-foreground/80" : "text-muted-foreground"
        )}
      >
        {count}
      </span>
    </button>
  )
}

/** A rich, expandable AI insight card — the centerpiece of the monitor. */
function InsightCard({
  insight,
  locale,
  expanded,
  onToggle,
  onApply,
  onDismiss,
  t,
}: {
  insight: VenueInsight
  locale: string
  expanded: boolean
  onToggle: () => void
  onApply: () => void
  onDismiss: () => void
  t: ReturnType<typeof useTranslations>
}) {
  const accent = severityAccent[insight.severity]
  const KindIcon = KIND_ICON[insight.kind]
  const reasoning = locList(insight.reasoning, locale)

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-3xl bg-card p-4 ring-1 transition-shadow hover:shadow-md sm:p-5",
        accent.ring
      )}
    >
      <div className="flex items-start gap-3">
        {/* Kind glyph */}
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-2xl",
            accent.chip
          )}
        >
          <KindIcon className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          {/* Severity + kind row */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase",
                accent.chip
              )}
            >
              <span className={cn("size-1.5 rounded-full", accent.dot)} />
              {t(`severity.${insight.severity}`)}
            </span>
            <MicroLabel>{t(`kind.${insight.kind}`)}</MicroLabel>
          </div>

          <h3 className="mt-2 font-heading text-base font-semibold tracking-tight">
            {locStr(insight.title, locale)}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {locStr(insight.detail, locale)}
          </p>

          {/* Target + impact chips */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {insight.target ? (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] tracking-wide text-muted-foreground tabular-nums">
                {locStr(insight.target, locale)}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-full bg-lime/20 px-2.5 py-1 text-xs font-semibold text-brand tabular-nums">
              <Sparkles className="size-3" />
              {locStr(insight.impact, locale)}
            </span>
          </div>
        </div>
      </div>

      {/* AI reasoning — chain of thought, styled like the player assistant */}
      <div className="rounded-3xl bg-muted/50 p-3 ring-1 ring-foreground/5 dark:ring-foreground/10">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex w-full items-center gap-2 text-left"
        >
          <Sparkles className="size-3.5 text-brand" />
          <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            {t("thoughtFor", { count: reasoning.length })}
          </span>
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 text-muted-foreground transition-transform",
              expanded ? "" : "-rotate-90"
            )}
          />
        </button>

        {expanded ? (
          <ol className="mt-2.5 flex flex-col gap-1.5">
            {reasoning.map((step, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-muted-foreground"
              >
                <Check className="mt-0.5 size-3.5 shrink-0 text-brand" />
                <span>{step}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={onDismiss}
        >
          <X />
          {t("dismiss")}
        </Button>
        <Button size="sm" className="rounded-full" onClick={onApply}>
          <Check />
          {locStr(insight.action, locale)}
        </Button>
      </div>
    </article>
  )
}

/** Reassuring empty state when nothing needs attention. */
function AllClear({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl bg-muted/50 px-6 py-12 text-center">
      <span className="relative grid size-12 place-items-center rounded-full bg-brand/12 text-brand">
        <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/40" />
        <CheckCheck className="relative size-6" />
      </span>
      <p className="font-heading text-base font-semibold">{t("clearTitle")}</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        {t("clearDetail")}
      </p>
    </div>
  )
}
