import assert from "node:assert/strict"
import test from "node:test"
import type { ModelMessage, UIMessage } from "ai"

import {
  dropEmptyToolCalls,
  stripReasoningParts,
} from "../src/features/ai/ai.service.js"

void test("stripReasoningParts removes reasoning from assistant turns only", () => {
  const messages: UIMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
    {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "thinking..." },
        { type: "text", text: "Hello" },
        { type: "reasoning", text: "more" },
      ],
    },
  ]
  const out = stripReasoningParts(messages)
  assert.equal(out.length, 2)
  assert.deepEqual(out[1].parts, [{ type: "text", text: "Hello" }])
  assert.deepEqual(out[0], messages[0])
})

void test("stripReasoningParts drops an assistant turn that was only reasoning", () => {
  const messages: UIMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
    {
      id: "a1",
      role: "assistant",
      parts: [{ type: "reasoning", text: "only thinking" }],
    },
  ]
  assert.deepEqual(
    stripReasoningParts(messages).map((m) => m.id),
    ["u1"]
  )
})

void test("stripReasoningParts drops provider metadata carried over from earlier replies", () => {
  const messages = [
    {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "Hello",
          providerMetadata: { openrouter: { reasoning_details: [{}] } },
        },
      ],
    },
  ] as UIMessage[]
  assert.deepEqual(stripReasoningParts(messages)[0].parts, [
    { type: "text", text: "Hello" },
  ])
})

void test("dropEmptyToolCalls removes a nameless tool call and its result, keeps the rest", async () => {
  const { convertToModelMessages } = await import("ai")
  const history: UIMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
    {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "",
          toolCallId: "bad",
          state: "output-available",
          input: {},
          output: {},
        },
        {
          type: "tool-findPlayers",
          toolCallId: "good",
          state: "output-available",
          input: { sport: "badminton" },
          output: { players: [] },
        },
        { type: "text", text: "Nobody yet" },
      ],
    },
    { id: "u2", role: "user", parts: [{ type: "text", text: "again" }] },
  ]
  const converted = await convertToModelMessages(history)
  const cleaned = dropEmptyToolCalls(converted)
  const calls = cleaned.flatMap((m) =>
    m.role === "assistant" && typeof m.content !== "string"
      ? m.content.flatMap((p) => (p.type === "tool-call" ? [p.toolCallId] : []))
      : []
  )
  assert.deepEqual(calls, ["good"])
  const results = cleaned.flatMap((m) =>
    m.role === "tool"
      ? m.content.flatMap((p) =>
          p.type === "tool-result" ? [p.toolCallId] : []
        )
      : []
  )
  assert.deepEqual(results, ["good"])
})

void test("dropEmptyToolCalls leaves a clean history untouched", () => {
  const messages = [
    { role: "user", content: [{ type: "text", text: "hi" }] },
  ] as ModelMessage[]
  assert.equal(dropEmptyToolCalls(messages), messages)
})
