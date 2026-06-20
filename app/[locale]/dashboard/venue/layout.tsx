import { VenueCopilot } from "@/components/dashboard/venue/venue-copilot"
import { VenueMonitorDock } from "@/components/dashboard/venue/venue-monitor-dock"
import { VenueProvider } from "@/components/dashboard/venue/venue-provider"

/**
 * Venue-workspace shell. Mounted under the shared dashboard layout, it adds the
 * operator-only providers and floating chrome (the AI copilot and the always-on
 * monitor dock) so their state survives navigation between venue sections.
 */
export default function VenueLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <VenueProvider>
      {children}
      <VenueCopilot />
      <VenueMonitorDock />
    </VenueProvider>
  )
}
