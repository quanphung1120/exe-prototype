import * as React from "react"

/**
 * True when the surrounding `<ChatView>` is rendered as the venue operator's
 * per-venue inbox (`/dashboard/venue/[venueId]/messages`) rather than the
 * player's own chat. Lives in its own file (not `chat.tsx`) so
 * `channel-list.tsx` can read it without an import cycle — `chat.tsx` already
 * imports `channel-list.tsx` for the list chrome components.
 */
export const VenueInboxContext = React.createContext(false)
