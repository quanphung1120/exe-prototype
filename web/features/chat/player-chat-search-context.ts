"use client"

import * as React from "react"

/** Presentation-only search over channels already managed by Stream ChannelList. */
export const PlayerChatSearchContext = React.createContext<{
  query: string
  setQuery: (query: string) => void
} | null>(null)

export function usePlayerChatSearch() {
  const context = React.useContext(PlayerChatSearchContext)
  if (!context) throw new Error("PlayerChatSearchContext is missing")
  return context
}
