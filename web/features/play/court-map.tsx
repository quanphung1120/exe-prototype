"use client"

import * as React from "react"
import Map, {
  Marker,
  NavigationControl,
  type MapRef,
  type MarkerEvent,
} from "react-map-gl/mapbox"
import { useTheme } from "@teispace/next-themes"

import "mapbox-gl/dist/mapbox-gl.css"

import { cn } from "@/lib/utils"
import { formatVnd, type Court } from "@/features/dashboard/data"

const TOKEN = process.env.NEXT_PUBLIC_BOXMAP_TOKEN

export type LatLng = { lat: number; lng: number }

// Ho Chi Minh City — the camera framing before any court is picked.
const HCMC = { longitude: 106.7009, latitude: 10.7769, zoom: 11.2 }

/**
 * The map panel of Find Courts. Each court is a price-pill marker; the active
 * one is highlighted and labelled, and selecting a court (here or in the list)
 * glides the camera to it. When the player shares their location it shows as a
 * pulsing dot and the camera fits both them and the courts in view.
 */
export function CourtMap({
  courts,
  selectedId,
  onSelect,
  userLoc,
}: {
  courts: Court[]
  selectedId: string | null
  onSelect: (id: string) => void
  userLoc: LatLng | null
}) {
  const mapRef = React.useRef<MapRef>(null)
  const fittedRef = React.useRef(false)
  const { resolvedTheme } = useTheme()

  // Glide the camera to the active court whenever the selection changes.
  React.useEffect(() => {
    const court = courts.find((c) => c.id === selectedId)
    if (!court) return
    mapRef.current?.flyTo({
      center: [court.lng, court.lat],
      zoom: 14,
      duration: 1200,
      essential: true,
    })
  }, [selectedId, courts])

  // The first time we get a location fix, frame the player and every court.
  React.useEffect(() => {
    if (!userLoc || fittedRef.current || !courts.length) return
    fittedRef.current = true
    const lngs = [userLoc.lng, ...courts.map((c) => c.lng)]
    const lats = [userLoc.lat, ...courts.map((c) => c.lat)]
    mapRef.current?.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 72, maxZoom: 14, duration: 1000 }
    )
  }, [userLoc, courts])

  if (!TOKEN) {
    return (
      <div className="grid h-full place-items-center bg-card px-6 text-center text-sm text-muted-foreground">
        Set <code className="mx-1 font-mono">NEXT_PUBLIC_BOXMAP_TOKEN</code> to
        enable the map.
      </div>
    )
  }

  const dark = resolvedTheme === "dark"

  return (
    <Map
      ref={mapRef}
      reuseMaps
      mapboxAccessToken={TOKEN}
      initialViewState={HCMC}
      mapStyle={
        dark
          ? "mapbox://styles/mapbox/dark-v11"
          : "mapbox://styles/mapbox/light-v11"
      }
      style={{ width: "100%", height: "100%" }}
    >
      <NavigationControl position="top-right" showCompass={false} />

      {userLoc ? (
        <Marker longitude={userLoc.lng} latitude={userLoc.lat} anchor="center">
          <span className="relative flex size-3.5">
            <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/60" />
            <span className="relative inline-flex size-3.5 rounded-full bg-brand ring-2 ring-card" />
          </span>
        </Marker>
      ) : null}

      {courts.map((c) => {
        const active = c.id === selectedId
        return (
          <Marker
            key={c.id}
            longitude={c.lng}
            latitude={c.lat}
            anchor="bottom"
            style={{ zIndex: active ? 3 : 1 }}
            onClick={(e: MarkerEvent<MouseEvent>) => {
              e.originalEvent.stopPropagation()
              onSelect(c.id)
            }}
          >
            <button
              type="button"
              aria-label={c.name}
              className="flex cursor-pointer flex-col items-center"
            >
              {active ? (
                <span className="mb-1 max-w-[11rem] truncate rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-brand-foreground shadow-md">
                  {c.name}
                </span>
              ) : null}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums shadow-md ring-2 transition-transform",
                  active
                    ? "scale-110 bg-brand text-brand-foreground ring-brand-foreground/40"
                    : "bg-foreground text-background ring-background/70"
                )}
              >
                {formatVnd(c.pricePerHour)}
              </span>
              <span
                className={cn(
                  "-mt-0.5 size-2 rotate-45 shadow-md",
                  active ? "bg-brand" : "bg-foreground"
                )}
              />
            </button>
          </Marker>
        )
      })}
    </Map>
  )
}
