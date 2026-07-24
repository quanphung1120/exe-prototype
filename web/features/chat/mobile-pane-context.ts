import * as React from "react"

/**
 * Which pane the chat shows on mobile (below `sm`, where the two-pane
 * layout collapses to one). Desktop always shows both; these values only
 * affect `hidden` classes behind the `sm:` breakpoint. Lives in its own
 * file (not `chat.tsx`) so `channel-list.tsx` can read it without an
 * import cycle — `chat.tsx` already imports `channel-list.tsx`.
 */
export const MobilePaneContext = React.createContext<{
  pane: "list" | "conversation"
  showList: () => void
  showConversation: () => void
}>({ pane: "list", showList: () => {}, showConversation: () => {} })
