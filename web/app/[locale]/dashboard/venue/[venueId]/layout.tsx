import { fetchVenueBundle } from "@/lib/api"
import { VenueDataProvider } from "@/features/venue/venue-data-provider"
import { VenueWorkspaceProvider } from "@/features/venue/venue-provider"

/**
 * Venue workspace layout. Each account owns exactly one venue, resolved
 * server-side from the caller's Clerk id — the `[venueId]` segment is kept for
 * routing but the bundle always comes from the owner-scoped endpoint, so the
 * provider is seeded with the caller's real venue id.
 */
export default async function VenueWorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const venueSeed = await fetchVenueBundle()

  return (
    <VenueDataProvider seed={venueSeed} venueId={venueSeed.info.id}>
      <VenueWorkspaceProvider>{children}</VenueWorkspaceProvider>
    </VenueDataProvider>
  )
}
