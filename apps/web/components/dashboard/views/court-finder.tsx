"use client"

import * as React from "react"
import {
  Check,
  MapPin,
  Navigation,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { formatVnd, type Court } from "@/components/dashboard/data"
import { useData } from "@/components/dashboard/data-provider"
import { useBooking } from "@/components/dashboard/booking"
import { useSportFilter } from "@/components/dashboard/sport-filter"
import { CourtImage, SportTag } from "@/components/dashboard/shared"

type SortKey = "distance" | "price" | "rating"

const SORTS: SortKey[] = ["distance", "price", "rating"]

const COMPARE: Record<SortKey, (a: Court, b: Court) => number> = {
  distance: (a, b) => a.distanceKm - b.distanceKm,
  price: (a, b) => a.pricePerHour - b.pricePerHour,
  rating: (a, b) => b.rating - a.rating,
}

/** Budget brackets (per hour, VND). `min` is inclusive, `max` exclusive. */
const PRICE_BANDS: { key: string; min?: number; max?: number }[] = [
  { key: "lt150", max: 150000 },
  { key: "mid", min: 150000, max: 250000 },
  { key: "gte250", min: 250000 },
]

/** Minimum guest-rating thresholds offered in the rail. */
const RATINGS = [4.5, 4.6, 4.7]
const TOTAL_DAILY_SLOTS = 8

const inBand = (price: number, b: (typeof PRICE_BANDS)[number]) =>
  (b.min == null || price >= b.min) && (b.max == null || price < b.max)

/** Booking.com-style score word for a rating, keyed into the `score.*` copy. */
const scoreWord = (rating: number) =>
  rating >= 4.7 ? "exceptional" : rating >= 4.5 ? "excellent" : "veryGood"

/** Lower-case and strip diacritics so search ignores case and accents. */
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()

/** Open Google Maps driving directions to a court in a new tab. */
function openDirections(court: Court) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${court.lat},${court.lng}`
  window.open(url, "_blank", "noopener,noreferrer")
}

/**
 * The dashboard home ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â a Booking.com-style court finder. A full-width search
 * bar, then a filter rail (budget, guest rating, availability) on the left and
 * a sortable list of court cards on the right. The sport is driven by the
 * shared topbar filter; below `lg` the rail collapses into a bottom sheet.
 */
export function CourtFinderView() {
  const t = useTranslations("CourtFinder")
  const { sport } = useSportFilter()
  const { courts: COURTS } = useData()

  const [sort, setSort] = React.useState<SortKey>("distance")
  const [query, setQuery] = React.useState("")
  const [priceBands, setPriceBands] = React.useState<Set<string>>(new Set())
  const [minRating, setMinRating] = React.useState(0)
  const [manySlots, setManySlots] = React.useState(false)
  const [mostlyFree, setMostlyFree] = React.useState(false)

  const togglePrice = React.useCallback((key: string) => {
    setPriceBands((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const clearFilters = React.useCallback(() => {
    setPriceBands(new Set())
    setMinRating(0)
    setManySlots(false)
    setMostlyFree(false)
  }, [])

  const activeCount =
    priceBands.size + (minRating > 0 ? 1 : 0) + (manySlots ? 1 : 0) + (mostlyFree ? 1 : 0)

  // Base set: sport (shared topbar filter) + free-text search on name/district.
  // Filter-option counts are derived from this so they read like Booking.com's
  // "how many properties match if I add this".
  const base = React.useMemo(() => {
    const q = normalize(query)
    return COURTS.filter((c) => sport === "all" || c.sports.includes(sport)).filter(
      (c) => !q || normalize(c.name).includes(q) || normalize(c.district).includes(q)
    )
  }, [COURTS, sport, query])

  const counts = React.useMemo(
    () => ({
      price: Object.fromEntries(
        PRICE_BANDS.map((b) => [b.key, base.filter((c) => inBand(c.pricePerHour, b)).length])
      ) as Record<string, number>,
      rating: Object.fromEntries(
        RATINGS.map((r) => [r, base.filter((c) => c.rating >= r).length])
      ) as Record<number, number>,
      manySlots: base.filter((c) => c.openSlots >= 5).length,
      mostlyFree: base.filter((c) => c.freePct >= 50).length,
    }),
    [base]
  )

  const items = React.useMemo(
    () =>
      base
        .filter(
          (c) =>
            priceBands.size === 0 ||
            PRICE_BANDS.some((b) => priceBands.has(b.key) && inBand(c.pricePerHour, b))
        )
        .filter((c) => c.rating >= minRating)
        .filter((c) => (!manySlots || c.openSlots >= 5) && (!mostlyFree || c.freePct >= 50))
        .slice()
        .sort(COMPARE[sort]),
    [base, priceBands, minRating, manySlots, mostlyFree, sort]
  )

  const filters = (
    <FilterControls
      sort={sort}
      setSort={setSort}
      priceBands={priceBands}
      togglePrice={togglePrice}
      minRating={minRating}
      setMinRating={setMinRating}
      manySlots={manySlots}
      setManySlots={setManySlots}
      mostlyFree={mostlyFree}
      setMostlyFree={setMostlyFree}
      counts={counts}
      activeCount={activeCount}
      onClear={clearFilters}
    />
  )

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      {/* Search ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â full width, the way a Booking.com destination bar reads. */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="h-[3.75rem] rounded-2xl !pr-12 text-left text-lg shadow-md ring-1 ring-foreground/5 placeholder:text-lg dark:ring-foreground/10"
          style={{ paddingLeft: "3rem", paddingRight: "3rem" }}
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("clearSearch")}
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* Filter rail ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â desktop */}
        <aside className="hidden lg:sticky lg:top-4 lg:block lg:self-start">{filters}</aside>

        {/* Results */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              {/* Filters trigger ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â mobile only */}
              <Sheet>
                <SheetTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full lg:hidden"
                      aria-label={t("filters")}
                    />
                  }
                >
                  <SlidersHorizontal className="size-4" />
                  {t("filters")}
                  {activeCount ? (
                    <span className="grid size-4 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground tabular-nums">
                      {activeCount}
                    </span>
                  ) : null}
                </SheetTrigger>
                <SheetContent
                  side="bottom"
                  className="max-h-[85vh] overflow-y-auto rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]"
                >
                  <SheetHeader className="pb-1">
                    <SheetTitle>{t("filters")}</SheetTitle>
                  </SheetHeader>
                  <div className="px-3 pb-3">{filters}</div>
                </SheetContent>
              </Sheet>
              <span className="inline-flex items-center rounded-full bg-muted/80 px-3 py-1.5 text-[1.05rem] font-semibold text-foreground shadow-sm ring-1 ring-foreground/5 tabular-nums">
                {t("results", { count: items.length })}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {items.map((court) => (
              <CourtCard key={court.id} court={court} />
            ))}
            {!items.length ? (
              <div className="flex flex-col items-center gap-3 rounded-4xl bg-card px-4 py-16 text-center shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
                <p className="text-sm text-muted-foreground">
                  {activeCount ? t("noResults") : t("empty")}
                </p>
                {activeCount ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={clearFilters}
                  >
                    {t("clearFilters")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The filter rail's contents ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â shared by the desktop aside and mobile sheet. */
function FilterControls({
  sort,
  setSort,
  priceBands,
  togglePrice,
  minRating,
  setMinRating,
  manySlots,
  setManySlots,
  mostlyFree,
  setMostlyFree,
  counts,
  activeCount,
  onClear,
}: {
  sort: SortKey
  setSort: (sort: SortKey) => void
  priceBands: Set<string>
  togglePrice: (key: string) => void
  minRating: number
  setMinRating: (r: number) => void
  manySlots: boolean
  setManySlots: (v: boolean) => void
  mostlyFree: boolean
  setMostlyFree: (v: boolean) => void
  counts: {
    price: Record<string, number>
    rating: Record<number, number>
    manySlots: number
    mostlyFree: number
  }
  activeCount: number
  onClear: () => void
}) {
  const t = useTranslations("CourtFinder")

  const priceLabel = (b: (typeof PRICE_BANDS)[number]) =>
    b.min == null
      ? t("price.under", { amount: formatVnd(b.max!) })
      : b.max == null
        ? t("price.over", { amount: formatVnd(b.min) })
        : t("price.range", { min: formatVnd(b.min), max: formatVnd(b.max) })

  return (
    <div className="flex flex-col rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
      <div className="flex items-center justify-between pb-4">
        <span className="font-heading text-base font-semibold">{t("filters")}</span>
        {activeCount ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-brand transition-colors hover:text-brand/80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            {t("clearAll")}
          </button>
        ) : null}
      </div>

      <FilterGroup title={t("sortBy")}>
        {SORTS.map((key) => (
          <RadioRow
            key={key}
            checked={sort === key}
            onSelect={() => setSort(key)}
            label={t(`sort.${key}`)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={t("price.label")}>
        {PRICE_BANDS.map((b) => (
          <CheckRow
            key={b.key}
            checked={priceBands.has(b.key)}
            onToggle={() => togglePrice(b.key)}
            label={priceLabel(b)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={t("rating.label")}>
        <RadioRow
          checked={minRating === 0}
          onSelect={() => setMinRating(0)}
          label={t("rating.any")}
        />
        {RATINGS.map((r) => (
          <RadioRow
            key={r}
            checked={minRating === r}
            onSelect={() => setMinRating(r)}
            label={t("rating.min", { score: r })}
            icon={<Star className="size-3 fill-lime text-lime" />}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={t("availability.label")}>
        <CheckRow
          checked={manySlots}
          onToggle={() => setManySlots(!manySlots)}
          label={t("availability.manySlots")}
        />
        <CheckRow
          checked={mostlyFree}
          onToggle={() => setMostlyFree(!mostlyFree)}
          label={t("availability.mostlyFree")}
        />
      </FilterGroup>
    </div>
  )
}

/** A titled filter section. */
function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border/60 py-4 last:pb-0">
      <span className="mb-1 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
        {title}
      </span>
      {children}
    </div>
  )
}

/** A checkbox row (multi-select). */
function CheckRow({
  checked,
  onToggle,
  label,
}: {
  checked: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="group flex items-center gap-2.5 rounded-xl px-1 py-1.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-[0.4rem] border transition-colors",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card group-hover:border-foreground/30"
        )}
      >
        {checked ? <Check className="size-3" /> : null}
      </span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  )
}

/** A radio row (single-select) with an optional icon. */
function RadioRow({
  checked,
  onSelect,
  label,
  icon,
}: {
  checked: boolean
  onSelect: () => void
  label: string
  icon?: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className="group flex items-center gap-2.5 rounded-xl px-1 py-1.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
          checked ? "border-primary" : "border-border group-hover:border-foreground/30"
        )}
      >
        {checked ? <span className="size-2 rounded-full bg-primary" /> : null}
      </span>
      <span className="flex flex-1 items-center gap-1 truncate">
        {icon}
        {label}
      </span>
    </button>
  )
}

/** A Booking.com-style result card: court "photo", details, rating + price/CTA. */
function CourtCard({ court }: { court: Court }) {
  const t = useTranslations("CourtFinder")
  const { openBooking } = useBooking()

  return (
    <article className="flex min-h-[164px] flex-col overflow-visible rounded-4xl bg-card shadow-md ring-1 ring-foreground/5 transition-shadow hover:shadow-lg sm:flex-row sm:items-stretch dark:ring-foreground/10">
      <CourtImage court={court} className="h-36 w-full sm:h-auto sm:w-52" />

      <div className="flex flex-1 flex-col gap-4 p-5 sm:flex-row sm:gap-5">
        {/* Details */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div>
            <h3 className="font-heading text-lg leading-tight font-semibold">{court.name}</h3>
            <p className="mt-0.5 inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              <span>
                {court.district} · {t("distance", { km: court.distanceKm })}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-semibold text-foreground ring-1 ring-foreground/5">
                <Star className="size-3 fill-lime text-lime" />
                {t(`score.${scoreWord(court.rating)}`)} {court.rating}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {court.sports.map((s) => (
              <SportTag key={s} sport={s} />
            ))}
            <span className="text-xs text-muted-foreground">
              · {t(`courts.${court.id}.surface`)}
            </span>
          </div>

          <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center rounded-full bg-muted/60 px-2.5 py-1 text-foreground ring-1 ring-foreground/5">
              <span className="font-semibold tabular-nums">{court.openSlots}</span>
              <span className="ml-1">{t("availability.slots")}</span>
            </span>
            <span>/</span>
            <span className="inline-flex items-center rounded-full bg-card px-2.5 py-1 font-mono font-semibold tabular-nums shadow-sm ring-1 ring-foreground/5">
              <span className="font-semibold tabular-nums">{TOTAL_DAILY_SLOTS}</span>
              <span className="ml-1">{t("availability.total")}</span>
            </span>
          </div>
        </div>

        {/* Price and actions */}
        <div className="flex shrink-0 flex-col justify-between gap-3 border-t border-border/60 py-4 sm:w-52 sm:border-t-0 sm:border-l sm:py-4 sm:pl-5">
          <div className="text-right">
            <span className="font-heading text-xl font-bold tabular-nums">
              {formatVnd(court.pricePerHour)}
            </span>
            <span className="text-xs text-muted-foreground">{t("perHour")}</span>
          </div>
          <div className="flex w-full items-center justify-end gap-3">
            <Button
              size="sm"
              variant="outline"
              className="h-10 shrink-0 rounded-full px-4"
              onClick={() => openDirections(court)}
            >
              <Navigation className="size-3.5" />
              <span className="hidden sm:inline">{t("directions")}</span>
            </Button>
            <Button
              size="sm"
              className="h-10 shrink-0 rounded-full px-5 shadow-md shadow-brand/20"
              onClick={() => openBooking(court.id)}
            >
              {t("book")}
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
}
