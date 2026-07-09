import { fetchVenues } from "@/lib/api"
import { venueBase } from "@/features/venue/nav"
import { redirect } from "@/i18n/navigation"

// The venue workspace is per-venue (`/dashboard/venue/[venueId]`). A bare
// `/dashboard/venue` has no venue context, so redirect into the first one —
// this keeps the workspace switcher and any legacy links working.
export const dynamic = "force-dynamic"

export default async function VenueIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const venues = await fetchVenues()
  const first = venues[0]
  if (first) redirect({ href: venueBase(first.id), locale })
  // No venues at all — fall back to the player dashboard.
  redirect({ href: "/dashboard", locale })
}
