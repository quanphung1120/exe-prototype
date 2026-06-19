import type { Metadata } from "next"

import { ChatView } from "@/components/dashboard/views/chat"

export const metadata: Metadata = {
  title: "Chat",
  description: "Coordinate your next match with players and venues.",
}

export default function ChatPage() {
  return <ChatView />
}
