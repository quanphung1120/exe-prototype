import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const { getToken, createClient } = vi.hoisted(() => ({
  getToken: vi.fn(() => new Promise(() => {})),
  createClient: vi.fn(),
}))

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ getToken }) }))
vi.mock("stream-chat-react", () => ({
  Chat: ({ children }: { children: unknown }) => children,
  useCreateChatClient: createClient,
}))
vi.mock("@/features/chat/stream-actions", () => ({
  refreshStreamToken: vi.fn(),
}))
vi.mock("@/features/chat/stream-i18n", () => ({ getStreami18n: vi.fn() }))

import { StreamChatProvider, useStreamChatStatus } from "./stream-provider"

describe("dashboard chat bootstrap", () => {
  it("renders dashboard content without waiting for auth or the chat service", () => {
    function Dashboard() {
      return createElement("p", null, `Dashboard: ${useStreamChatStatus()}`)
    }

    const html = renderToString(
      createElement(
        StreamChatProvider,
        { userId: "test-user", userName: "Test User" },
        createElement(Dashboard)
      )
    )

    expect(html).toContain("Dashboard: connecting")
    expect(getToken).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })
})
