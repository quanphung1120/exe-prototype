import { VenueCopilot } from "@/components/dashboard/venue/venue-copilot"
import { VenueWorkspaceProvider } from "@/components/dashboard/venue/venue-provider"

/**
 * Venue-workspace shell. Mounted under the shared dashboard layout, it adds the
 * operator-only providers and floating chrome (the AI copilot) so their state
 * survives navigation between venue sections.
 */
export default function VenueLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <VenueWorkspaceProvider>
      {children}
      <VenueCopilot />
    </VenueWorkspaceProvider>
  )
}
