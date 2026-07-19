import * as React from "react"

/**
 * Carries the "open this player's profile" callback from ChatView down to the
 * SDK-rendered message components (wired via WithComponents, so they can't
 * receive it as props). Consumers pass roster initials; ChatView owns the
 * PlayerProfileDialog state. Null when there's no handler in scope.
 */
export const ChatProfileContext = React.createContext<
  ((initials: string) => void) | null
>(null)

export const useOpenChatProfile = () => React.useContext(ChatProfileContext)
