"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import {
  sportShort,
  type Chat,
  type Message,
} from "@/components/dashboard/data"
import { useData } from "@/components/dashboard/data-provider"
import { useMatchmaking } from "@/components/dashboard/matchmaking"

/** Chat id for a match room's team thread. */
export const roomChatId = (roomId: string) => `room-${roomId}`

interface ChatContextValue {
  /** Room team chats (newest first) followed by the base conversations. */
  chats: Chat[]
  activeChatId: string | null
  /** Select a chat and mark it read. */
  setActiveChatId: (id: string) => void
  /** Full thread for a chat: seeded messages plus anything the user has sent. */
  threadFor: (chatId: string) => Message[]
  sendMessage: (chatId: string, text: string) => void
}

const ChatContext = React.createContext<ChatContextValue | null>(null)

export function useChat() {
  const ctx = React.useContext(ChatContext)
  if (!ctx) throw new Error("useChat must be used within a ChatProvider.")
  return ctx
}

/**
 * Owns the chat list and threads. Mounted in the dashboard layout (inside
 * MatchmakingProvider) so a team chat appears for every joined room and threads
 * survive navigation between pages.
 */
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Chat")
  const tm = useTranslations("MatchMaker")
  const { joinedRooms } = useMatchmaking()
  const {
    chats: CHATS,
    thread: THREAD,
    user: USER,
    playerByInitials,
  } = useData()

  const [userMessages, setUserMessages] = React.useState<
    Record<string, Message[]>
  >({})
  const [openedChatIds, setOpenedChatIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [activeChatId, setActiveChatIdState] = React.useState<string | null>(
    null
  )

  const roomTitle = (room: (typeof joinedRooms)[number]) =>
    tm.has(`rooms.${room.id}.title`) ? tm(`rooms.${room.id}.title`) : room.title

  /** The participant whose greeting seeds the thread (anyone but the user). */
  const greeter = (room: (typeof joinedRooms)[number]) =>
    room.players.find((p) => p !== USER.initials) ?? null

  const previewText = (room: (typeof joinedRooms)[number]) =>
    greeter(room) ? t("teamWelcome", { venue: room.venue }) : t("teamCreated")

  const roomChats: Chat[] = joinedRooms.map((room) => {
    const id = roomChatId(room.id)
    return {
      id,
      name: roomTitle(room),
      initials: sportShort(room.sport),
      last: previewText(room),
      time: t("now"),
      unread: openedChatIds.has(id) ? 0 : 1,
      online: true,
      group: true,
      members: room.players.length,
    }
  })

  const baseChats: Chat[] = CHATS.map((c) =>
    openedChatIds.has(c.id) ? { ...c, unread: 0 } : c
  )

  const chats = [...roomChats, ...baseChats]

  const threadFor = (chatId: string): Message[] => {
    const sent = userMessages[chatId] ?? []
    const room = joinedRooms.find((r) => roomChatId(r.id) === chatId)
    if (room) {
      const other = greeter(room)
      const seed: Message[] = other
        ? [
            {
              id: `${chatId}-seed`,
              mine: false,
              author: playerByInitials(other).name,
              text: t("teamWelcome", { venue: room.venue }),
              time: t("now"),
            },
          ]
        : []
      return [...seed, ...sent]
    }
    return [...THREAD, ...sent]
  }

  const setActiveChatId = (id: string) => {
    setActiveChatIdState(id)
    setOpenedChatIds((prev) => new Set(prev).add(id))
  }

  const sendMessage = (chatId: string, text: string) => {
    setUserMessages((prev) => {
      const existing = prev[chatId] ?? []
      const message: Message = {
        id: `${chatId}-u${existing.length + 1}`,
        mine: true,
        author: USER.first,
        text,
        time: "now",
      }
      return { ...prev, [chatId]: [...existing, message] }
    })
  }

  const value: ChatContextValue = {
    chats,
    activeChatId,
    setActiveChatId,
    threadFor,
    sendMessage,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}
