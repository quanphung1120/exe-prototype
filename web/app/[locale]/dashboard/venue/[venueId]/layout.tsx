import { fetchVenueBundle } from "@/lib/api"
import { VenueDataProvider } from "@/features/venue/venue-data-provider"
import { VenueWorkspaceProvider } from "@/features/venue/venue-provider"

/**
 * Venue workspace layout. An account's brand may own many venue branches (chi
 * nhánh), so the active branch is the `[venueId]` segment of the URL: the layout
 * loads that branch's bundle (the API authorizes the caller owns it) and seeds
 * the provider with it. A venueId the caller doesn't own 404s here.
 */
export default async function VenueWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ venueId: string }>
}) {
  const { venueId } = await params
  const venueSeed = await fetchVenueBundle(venueId)

  return (
    <VenueDataProvider seed={venueSeed} venueId={venueSeed.info.id}>
      <VenueWorkspaceProvider>{children}</VenueWorkspaceProvider>
    </VenueDataProvider>
  )
}
