import assert from "node:assert/strict"
import test from "node:test"
import type { UIMessage } from "ai"

import { stripReasoningParts } from "../src/features/ai/ai.service.js"

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
