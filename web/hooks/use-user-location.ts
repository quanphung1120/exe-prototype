"use client"

import * as React from "react"
import { hasCoordinates, type Coordinates } from "@/lib/shared/location"

export function useUserLocation() {
  const [userLoc, setUserLoc] = React.useState<Coordinates | null>(null)
  const [geoStatus, setGeoStatus] = React.useState<"locating" | "on" | "off">(
    "locating"
  )
  const requestLocation = React.useCallback(() => {
    setGeoStatus("locating")
    return new Promise<Coordinates | null>((resolve) => {
      const unavailable = () => {
        setUserLoc(null)
        setGeoStatus("off")
        resolve(null)
      }
      if (!navigator.geolocation) return unavailable()
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }
          if (!hasCoordinates(location)) return unavailable()
          setUserLoc(location)
          setGeoStatus("on")
          resolve(location)
        },
        unavailable,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      )
    })
  }, [])

  React.useEffect(() => {
    const id = setTimeout(() => void requestLocation(), 0)
    return () => clearTimeout(id)
  }, [requestLocation])

  return { userLoc, geoStatus, requestLocation }
}
