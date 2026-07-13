import { fetchMyVenue } from "@/lib/api"
import { venueBase } from "@/features/venue/nav"
import { redirect } from "@/i18n/navigation"

// The venue workspace lives under `/dashboard/venue/[venueId]`. A bare
// `/dashboard/venue` resolves the caller's own venue and redirects into it — or
// to the setup wizard when the account hasn't provisioned one yet.
export const dynamic = "force-dynamic"

export default async function VenueIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const venue = await fetchMyVenue()
  if (venue) redirect({ href: venueBase(venue.info.id), locale })
  redirect({ href: "/setup", locale })
}
