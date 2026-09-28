export type Coordinates = { lat: number; lng: number }

export function hasCoordinates<
  T extends { lat?: number | null; lng?: number | null },
>(value: T | null | undefined): value is T & Coordinates {
  return Boolean(
    value &&
    typeof value.lat === "number" &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    Math.abs(value.lat) <= 90 &&
    Math.abs(value.lng) <= 180
  )
}

/** Great-circle distance, not driving distance. Missing coordinates stay unknown. */
export function distanceKmBetween(
  origin: { lat?: number | null; lng?: number | null } | null | undefined,
  destination: { lat?: number | null; lng?: number | null } | null | undefined
): number | null {
  if (!hasCoordinates(origin) || !hasCoordinates(destination)) return null
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const h =
    Math.sin(radians(destination.lat - origin.lat) / 2) ** 2 +
    Math.cos(radians(origin.lat)) *
      Math.cos(radians(destination.lat)) *
      Math.sin(radians(destination.lng - origin.lng) / 2) ** 2
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(Math.min(1, h))) * 10) / 10
}

/** Known distances first; two unknown distances compare equally. */
export function compareDistance(
  a: { distanceKm: number | null },
  b: { distanceKm: number | null }
): number {
  if (a.distanceKm === b.distanceKm) return 0
  if (a.distanceKm == null) return 1
  if (b.distanceKm == null) return -1
  return a.distanceKm - b.distanceKm
}
