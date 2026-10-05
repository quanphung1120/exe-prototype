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
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <ChatView venueInboxId={venueId} venueInboxBrandId={venue.brandId} />
    </div>
  )
}
