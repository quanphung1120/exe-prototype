"use client"

import { useTranslations } from "next-intl"

import { ChatView } from "@/features/chat/chat"
import { useVenueData } from "@/features/venue/venue-data-provider"

/**
 * The venue operator's per-venue inbox — every player↔venue chat for this
 * venue, in the same `ChatView` shell the player-side `/app/chat`
 * uses, scoped via `venueInboxId` (see `chat.tsx`/`VenueInboxContext`).
 */
export function VenueMessagesView() {
  const t = useTranslations("VenueMessages")
  const { venueId, venue } = useVenueData()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="min-h-0 flex-1">
        <ChatView venueInboxId={venueId} venueInboxBrandId={venue.brandId} />
      </div>
    </div>
  )
}
