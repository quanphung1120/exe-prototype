import { fetchVenueBundle } from "@/lib/api"
import { VenueDataProvider } from "@/components/dashboard/venue-data-provider"
import { VenueWorkspaceProvider } from "@/components/dashboard/venue/venue-provider"

/**
 * Per-venue workspace layout. Called when the user navigates to a specific
 * venue's workspace. Fetches that venue's data from the API and provides it
 * through VenueDataProvider.
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
    <VenueDataProvider seed={venueSeed} venueId={venueId}>
      <VenueWorkspaceProvider>
        {children}
      </VenueWorkspaceProvider>
    </VenueDataProvider>
  )
}
