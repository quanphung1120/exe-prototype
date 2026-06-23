"use client"

import * as React from "react"
import {
  Loader2,
  Locate,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  Star,
  X,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatVnd, type Court } from "@/components/dashboard/data"
import { useData } from "@/components/dashboard/data-provider"
import { useBooking } from "@/components/dashboard/booking"
import { useSportFilter } from "@/components/dashboard/sport-filter"
import { SportTag } from "@/components/dashboard/shared"
import { CourtMap, type LatLng } from "@/components/dashboard/court-map"

type SortKey = "distance" | "price" | "rating"
type GeoStatus = "locating" | "on" | "off"

const SORTS: SortKey[] = ["distance", "price", "rating"]

/** A court paired with its distance to the player (or the static fallback). */
type CourtItem = { court: Court; distanceKm: number }

const COMPARE: Record<SortKey, (a: CourtItem, b: CourtItem) => number> = {
  distance: (a, b) => a.distanceKm - b.distanceKm,
  price: (a, b) => a.court.pricePerHour - b.court.pricePerHour,
  rating: (a, b) => b.court.rating - a.court.rating,
}

/** Lower-case and strip diacritics so search ignores case and accents. */
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()

const toRad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance in km between two coordinates. */
function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Open Google Maps driving directions to a court in a new tab. */
function openDirections(court: Court) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${court.lat},${court.lng}`
  window.open(url, "_blank", "noopener,noreferrer")
}

export function FindCourtsView() {
  const t = useTranslations("FindCourts")
  const { sport } = useSportFilter()
  const { courts: COURTS } = useData()
  const [sort, setSort] = React.useState<SortKey>("distance")
  const [query, setQuery] = React.useState("")
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [userLoc, setUserLoc] = React.useState<LatLng | null>(null)
  const [geoStatus, setGeoStatus] = React.useState<GeoStatus>("locating")

  // Ask the browser for a location fix. setState only fires in the async
  // callbacks, never synchronously — so this is safe to call from an effect.
  const requestLocation = React.useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // No geolocation here (e.g. insecure origin) — leave the spinner state
      // and re-enable the button instead of spinning forever.
      setGeoStatus("off")
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoStatus("on")
      },
      () => setGeoStatus("off"),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  // Try once on mount; the player can retry from the map button. Deferred so
  // the synchronous "no geolocation" status update never fires inside the
  // effect body (react-hooks/set-state-in-effect).
  React.useEffect(() => {
    const id = setTimeout(requestLocation, 0)
    return () => clearTimeout(id)
  }, [requestLocation])

  const locate = React.useCallback(() => {
    setGeoStatus("locating")
    requestLocation()
  }, [requestLocation])

  // Filter by sport + search, attach the live distance, then sort. The search
  // box invites "address or name" but only matches court name behind the
  // scenes. Distances fall back to the static field until location is shared.
  const items = React.useMemo(() => {
    const q = normalize(query)
    return COURTS.filter((c) => sport === "all" || c.sports.includes(sport))
      .filter((c) => !q || normalize(c.name).includes(q))
      .map((court) => ({
        court,
        distanceKm: userLoc ? haversineKm(userLoc, court) : court.distanceKm,
      }))
      .sort(COMPARE[sort])
  }, [COURTS, sport, sort, userLoc, query])

  const mapCourts = React.useMemo(() => items.map((i) => i.court), [items])

  // Derive the live selection rather than syncing state in an effect — a court
  // dropped by the sport filter simply stops being selected.
  const selectedId_ = items.some((i) => i.court.id === selectedId)
    ? selectedId
    : null

  return (
    <div className="grid gap-4 lg:h-[calc(100vh-11rem)] lg:min-h-[30rem] lg:grid-cols-10">
      {/* Map — 70% */}
      <div className="relative h-[320px] overflow-hidden bg-card shadow-md ring-1 ring-foreground/5 lg:col-span-7 lg:h-full dark:ring-foreground/10">
        <CourtMap
          courts={mapCourts}
          selectedId={selectedId_}
          onSelect={setSelectedId}
          userLoc={userLoc}
        />
        <button
          type="button"
          onClick={locate}
          disabled={geoStatus === "locating"}
          className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-1.5 text-xs font-medium shadow-md ring-1 ring-foreground/10 backdrop-blur transition-colors hover:bg-card disabled:opacity-80"
        >
          {geoStatus === "locating" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : geoStatus === "on" ? (
            <LocateFixed className="size-3.5 text-brand" />
          ) : (
            <Locate className="size-3.5" />
          )}
          {t(`geo.${geoStatus}`)}
        </button>
      </div>

      {/* List + filters — 30% */}
      <div className="flex flex-col gap-3 lg:col-span-3 lg:h-full lg:min-h-0">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-9 pr-8 pl-8"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("clearSearch")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("nearby", { count: items.length })}
          </span>
          <div
            role="radiogroup"
            aria-label={t("sortBy")}
            className="flex shrink-0 items-center gap-0.5 rounded-full bg-muted/60 p-0.5"
          >
            {SORTS.map((key) => {
              const active = sort === key
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSort(key)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    active
                      ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/5"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(`sort.${key}`)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Bleed the scroll area into the gutter so overflow clipping doesn't
            cut each card's ring/shadow on the left and right edges. */}
        <div className="no-scrollbar flex flex-col gap-3 lg:-mx-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-2 lg:py-1">
          {items.map((item) => (
            <CourtCard
              key={item.court.id}
              court={item.court}
              distanceKm={item.distanceKm}
              active={item.court.id === selectedId_}
              onSelect={() => setSelectedId(item.court.id)}
            />
          ))}
          {!items.length ? (
            <p className="rounded-4xl bg-card px-4 py-16 text-center text-sm text-muted-foreground shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
              {t("empty")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CourtCard({
  court,
  distanceKm,
  active,
  onSelect,
}: {
  court: Court
  distanceKm: number
  active: boolean
  onSelect: () => void
}) {
  const t = useTranslations("FindCourts")
  const { openBooking } = useBooking()
  const ref = React.useRef<HTMLDivElement>(null)

  // Reveal the card when it becomes the selection (e.g. via a map marker).
  React.useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" })
  }, [active])

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 transition-shadow hover:shadow-lg",
        active
          ? "ring-2 ring-brand"
          : "ring-foreground/5 dark:ring-foreground/10"
      )}
    >
      {/* Stretched click target — selecting the card flies the map to it.
          The action buttons below opt back into pointer events and sit above. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        aria-label={court.name}
        className="absolute inset-0 z-0 rounded-4xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />

      <div className="pointer-events-none relative z-10 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-semibold">
              {court.name}
            </p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              {court.district} ·{" "}
              {t("distance", { km: Math.round(distanceKm * 10) / 10 })}
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
          <span className="text-xs text-muted-foreground">
            · {t(`courts.${court.id}.surface`)}
          </span>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {t("openSlots", { count: court.openSlots })}
            </span>
            <span className="font-mono font-semibold tabular-nums">
              {t("freePct", { pct: court.freePct })}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-lime to-brand"
              style={{ width: `${court.freePct}%` }}
            />
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-4">
          <div>
            <span className="font-heading text-xl font-bold tabular-nums">
              {formatVnd(court.pricePerHour)}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("perHour")}
            </span>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => openDirections(court)}
            >
              <Navigation className="size-3.5" />
              <span className="hidden sm:inline">{t("directions")}</span>
            </Button>
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => openBooking(court.id)}
            >
              {t("book")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
