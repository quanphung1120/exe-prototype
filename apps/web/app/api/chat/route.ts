import { streamText, tool, stepCountIs, convertToModelMessages } from "ai"
import type { UIMessage } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { z } from "zod"

import { fetchSeed } from "@/lib/api"
import { findMatchedPlayers } from "@/lib/player-matching"
import type { Court, SportKey } from "@repo/shared"

// OpenRouter provider — surfaces the model's real reasoning tokens as AI SDK
// reasoning parts (the plain @ai-sdk/openai provider drops OpenRouter's
// `delta.reasoning`). Set OPENROUTER_MODEL to override the default.
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
})

// Default to a small, fast reasoning-capable model (Claude Haiku 4.5 — the
// thinking-enabled successor to "hy3-preview"). Any model that returns a
// reasoning field over OpenRouter will stream its chain of thought.
const MODEL = process.env.OPENROUTER_MODEL ?? "anthropic/claude-haiku-4.5"

const SYSTEM = `\
You are SportMatch AI — a smart assistant for finding badminton and pickleball courts and matching teammates in Ho Chi Minh City.

How to respond:
1. If the request is ambiguous (missing sport OR unclear whether they want courts vs. teammates), ask ONE short clarifying question and stop. Do not call a tool.
2. Otherwise call exactly one tool — \`findCourts\` or \`findPlayers\` — based on intent.
3. After the tool returns, write ONE short natural sentence summarising what you found.

Intent rules:
- "courts / booking / venue / sân" → \`findCourts\`
- "teammates / players / partner / tìm người / đồng đội" → \`findPlayers\`

Support Vietnamese queries. Keep all text responses short.`

export async function POST(req: Request) {
  const body = (await req.json()) as { messages: UIMessage[] }
  const { courts, players } = await fetchSeed()

  const messages = await convertToModelMessages(body.messages)

  const result = streamText({
    // `reasoning` is passed through to OpenRouter; effort "low" keeps the
    // chain of thought concise and snappy on a small model.
    model: openrouter(MODEL),
    system: SYSTEM,
    messages,
    stopWhen: stepCountIs(5),
    tools: {
      findCourts: tool({
        description: "Find and rank sports courts that match the user intent.",
        inputSchema: z.object({
          sport: z.enum(["badminton", "pickleball"]).optional(),
          sortBy: z.enum(["rating", "price", "distance", "team"]).optional(),
        }),
        execute: async ({ sport, sortBy }) => {
          const pool = courts.filter(
            (c: Court) => !sport || c.sports.includes(sport)
          )
          const candidates = pool.length ? pool : courts
          const ranked = [...candidates].sort((a: Court, b: Court) => {
            if (sortBy === "price") return a.pricePerHour - b.pricePerHour
            if (sortBy === "distance") return a.distanceKm - b.distanceKm
            if (sortBy === "team")
              return b.openSlots - a.openSlots || b.rating - a.rating
            return b.rating - a.rating || a.distanceKm - b.distanceKm
          })
          return {
            courts: ranked.slice(0, 3),
            sortBy: sortBy ?? "rating",
            sport: (sport ?? null) as SportKey | null,
          }
        },
      }),

      findPlayers: tool({
        description: "Find and rank players that match the user request.",
        inputSchema: z.object({
          sport: z.enum(["badminton", "pickleball"]).optional(),
          level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
          timeLabel: z.string().optional(),
          locationLabel: z.string().optional(),
        }),
        execute: async ({ sport, level, timeLabel, locationLabel }) => {
          const prompt = [sport, level, timeLabel, locationLabel]
            .filter(Boolean)
            .join(" ")
          const { intent, matches } = findMatchedPlayers(
            prompt,
            players,
            sport ?? "all",
            level ?? "intermediate"
          )
          return { intent, players: matches.slice(0, 6) }
        },
      }),
    },
  })

  return result.toUIMessageStreamResponse({ sendReasoning: true })
}
