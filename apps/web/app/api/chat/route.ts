import { streamText, tool, stepCountIs, convertToModelMessages } from "ai"
import type { UIMessage } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { z } from "zod"
import { auth } from "@clerk/nextjs/server"

import { fetchSeed } from "@/lib/api"
import { findMatchedPlayers } from "@/lib/player-matching"
import type { Court, Level, SportKey } from "@repo/shared"

type SportLevels = Partial<Record<SportKey, Level>>
type LatLng = { lat: number; lng: number }

// Great-circle distance in km — mirrors the client helper so the model can rank
// courts by the user's real position instead of the static seed `distanceKm`.
const toRad = (deg: number) => (deg * Math.PI) / 180
function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Fold the client-sent skill levels + location into a system-prompt block so the
// model can speak to the user's level and prefer nearby courts.
function buildUserContext(
  levels: SportLevels | undefined,
  loc: LatLng | null | undefined
) {
  const lines: string[] = []
  const levelPairs = Object.entries(levels ?? {}).filter(([, v]) => v)
  if (levelPairs.length) {
    lines.push(
      `- Skill level by sport: ${levelPairs
        .map(([sport, level]) => `${sport} = ${level}`)
        .join(
          ", "
        )}. Match teammates to the level for the relevant sport unless the user overrides it.`
    )
  }
  if (loc) {
    lines.push(
      `- Approximate location: lat ${loc.lat.toFixed(4)}, lng ${loc.lng.toFixed(
        4
      )}. Court distances are already computed from this point — prefer closer courts when ranking by distance.`
    )
  }
  if (!lines.length) return ""
  return `\n\nUser context (from the client, do not repeat verbatim):\n${lines.join(
    "\n"
  )}`
}

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
2. If finding a court and the request is ambiguous or lacks location details (e.g. missing district, neighborhood, or nearest area), ask ONE short clarifying question to get these details (e.g., district, nearest area) and stop. Do not call a tool.
3. If matching/finding players and the request is ambiguous or lacks details (e.g. missing skill level, district/location, or preferred time), ask ONE short clarifying question to get these details (e.g., skill level, district, preferred time) and stop. Do not call a tool.
4. Otherwise call exactly one tool — \`findCourts\` or \`findPlayers\` — based on intent.
5. After the tool returns, write ONE short natural sentence summarising what you found.

Intent rules:
- "courts / booking / venue / sân" → \`findCourts\`
- "teammates / players / partner / tìm người / đồng đội" → \`findPlayers\`

Support Vietnamese queries. Keep all text responses short.`

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }

  // Fail fast with a clear signal when the key is missing, instead of letting
  // every request reach OpenRouter and get rejected mid-stream with a 401 that
  // looks like a generic streaming error.
  if (!process.env.OPENROUTER_API_KEY) {
    return new Response("Server is missing OPENROUTER_API_KEY", { status: 500 })
  }

  let body: {
    messages: UIMessage[]
    userLevels?: SportLevels
    userLocation?: LatLng | null
  }
  try {
    body = await req.json()
  } catch {
    return new Response("Invalid JSON body", { status: 400 })
  }
  if (!Array.isArray(body?.messages)) {
    return new Response("`messages` must be an array", { status: 400 })
  }
  const { userLevels, userLocation } = body
  const { courts, players } = await fetchSeed()

  const messages = await convertToModelMessages(body.messages)

  const result = streamText({
    // `reasoning: { effort: "low" }` is passed through to the OpenRouter API
    // (OpenRouterModelOptions has a pass-through index signature) to keep the
    // streamed chain of thought concise and snappy on a small model.
    model: openrouter(MODEL, { reasoning: { effort: "low" } }),
    system: SYSTEM + buildUserContext(userLevels, userLocation),
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
          const base = pool.length ? pool : courts
          // When we have the user's real position, override the static seed
          // distance with the actual great-circle distance so distance ranking
          // (and the distance shown on each card) reflects where they are.
          const candidates = userLocation
            ? base.map((c: Court) => ({
                ...c,
                distanceKm: Math.round(haversineKm(userLocation, c) * 10) / 10,
              }))
            : base
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
          // Default to the user's own level for the chosen sport (sent from the
          // client) rather than a flat "intermediate" when they don't specify.
          const defaultLevel = (sport && userLevels?.[sport]) ?? "intermediate"
          const { intent, matches } = findMatchedPlayers(
            prompt,
            players,
            sport ?? "all",
            level ?? defaultLevel
          )
          return { intent, players: matches.slice(0, 6) }
        },
      }),
    },
  })

  return result.toUIMessageStreamResponse({ sendReasoning: true })
}
