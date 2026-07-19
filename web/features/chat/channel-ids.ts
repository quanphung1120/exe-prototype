// Client-safe Stream channel-id helpers, mirroring the conventions the api
// enforces (api/src/features/stream/stream.service.ts). Keeping them here lets
// the UI build the exact channel id to open (`?channel=<id>`) without a round
// trip, and keeps the id shapes in one place on the web side.

/** Channel id for a match-room / team chat. */
export const roomChannelId = (roomId: string) => `room-${roomId}`

/** Per-user channel id for a seeded demo chat (never shared between users). */
export const demoChannelId = (chatId: string, userId: string) =>
  `demo-${chatId}-${userId}`

/**
 * The mock player's initials encoded in a `demo-player-*` Stream user id, or
 * null for any other id (e.g. a Clerk user id). Used to map a DM's other member
 * back to a roster entry so the header can open their profile dialog.
 */
export const playerInitialsFromStreamId = (id: string) =>
  id.startsWith("demo-player-")
    ? id.slice("demo-player-".length).toUpperCase()
    : null
