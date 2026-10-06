// Hand-duplicated copy of web/features/play/player-matching.ts — see the
// repo's shared-code convention (CLAUDE.md). Keep in sync by hand.
import type { Court, Level, Player, SportKey } from "../../shared/index.js"

export type AiIntentKind = "court" | "player"
export type MatchTimeKey =
  "tonight" | "tomorrow" | "saturday" | "weekend" | "this-weekend"

export interface PlayerMatchIntent {
  kind: AiIntentKind
  prompt: string
  sport: SportKey | null
  targetLevel: Level | null
  useUserLevel: boolean
  location: string | null
  locationLabel: string | null
  timeKey: MatchTimeKey | null
  timeLabel: string | null
  requestedPlayers: number | null
}

export interface PlayerProfile extends Player {
  age: number
  location: string
  preferredArea: string
  availability: string[]
  availabilityTags: MatchTimeKey[]
  sportPreferences: SportKey[]
  playStyle: string
  completedMatches: number
  rating: number
  reviewSnippets: string[]
  badges: string[]
}

export interface PlayerMatchResult extends PlayerProfile {
  score: number
  matchPct: number
  reason: string
}

const SPORT_ALIASES: Record<SportKey, string[]> = {
  badminton: ["badminton", "cau long", "cau-long"],
}

const LEVEL_ALIASES: Record<Level, string[]> = {
  beginner: ["beginner", "newbie", "casual", "moi choi", "moi bat dau"],
  intermediate: ["intermediate", "mid", "trung cap", "trung binh"],
  advanced: ["advanced", "pro", "competitive", "nang cao", "trinh cao"],
}

const AREA_ALIASES = [
  { canonical: "District 7", aliases: ["district 7", "quan 7", "q7"] },
  {
    canonical: "Binh Thanh",
    aliases: ["binh thanh", "b.thanh", "bthanh"],
  },
  { canonical: "District 3", aliases: ["district 3", "quan 3", "q3"] },
  { canonical: "District 1", aliases: ["district 1", "quan 1", "q1"] },
  { canonical: "Thu Duc", aliases: ["thu duc", "thuduc"] },
  { canonical: "Phu Nhuan", aliases: ["phu nhuan", "pn"] },
]

const TIME_RULES: Array<{
  key: MatchTimeKey
  label: string
  keywords: string[]
}> = [
  {
    key: "tonight",
    label: "Tonight",
    keywords: ["tonight", "toi nay", "this evening", "chieu nay"],
  },
  {
    key: "tomorrow",
    label: "Tomorrow",
    keywords: ["tomorrow", "ngay mai", "mai"],
  },
  {
    key: "saturday",
    label: "This Saturday",
    keywords: ["this saturday", "saturday", "thu 7", "thu bay"],
  },
  {
    key: "this-weekend",
    label: "This weekend",
    keywords: ["this weekend", "cuoi tuan nay"],
  },
  {
    key: "weekend",
    label: "Weekend",
    keywords: ["weekend", "cuoi tuan"],
  },
]

const LEVEL_ORDER: Level[] = ["beginner", "intermediate", "advanced"]

function normalize(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
}

function includesAny(input: string, keywords: string[]) {
  return keywords.some((keyword) => input.includes(keyword))
}

function levelDistance(a: Level, b: Level) {
  return Math.abs(LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b))
}

export function parsePlayerIntent(
  prompt: string,
  selectedSport: SportKey | "all",
  userLevel: Level
): PlayerMatchIntent {
  const normalized = normalize(prompt)

  const sport =
    (Object.entries(SPORT_ALIASES).find(([, aliases]) =>
      includesAny(normalized, aliases)
    )?.[0] as SportKey | undefined) ??
    (selectedSport === "all" ? null : selectedSport)

  const targetLevel =
    (Object.entries(LEVEL_ALIASES).find(([, aliases]) =>
      includesAny(normalized, aliases)
    )?.[0] as Level | undefined) ?? null

  const useUserLevel =
    normalized.includes("same level") ||
    normalized.includes("same-level") ||
    normalized.includes("cung trinh") ||
    normalized.includes("cung cap") ||
    (!targetLevel &&
      (normalized.includes("my level") ||
        normalized.includes("around my level")))

  const area = AREA_ALIASES.find(({ aliases }) =>
    includesAny(normalized, aliases)
  )

  const timeRule = TIME_RULES.find(({ keywords }) =>
    includesAny(normalized, keywords)
  )

  const countMatch =
    normalized.match(/\b(\d+)\s+(nguoi|players?|teammates?|partners?)\b/) ??
    normalized.match(/\bcan\s+(\d+)\b/) ??
    normalized.match(/\bneed\s+(\d+)\b/)

  return {
    kind: "player",
    prompt,
    sport,
    targetLevel: useUserLevel ? userLevel : targetLevel,
    useUserLevel,
    location: area ? normalize(area.canonical) : null,
    locationLabel: area?.canonical ?? null,
    timeKey: timeRule?.key ?? null,
    timeLabel: timeRule?.label ?? null,
    requestedPlayers: countMatch ? Number(countMatch[1]) : null,
  }
}

export function buildPlayerProfiles(players: Player[]): PlayerProfile[] {
  return players.map((player) => {
    // Only what the player record itself knows — no invented age, area,
    // schedule, rating or reviews.
    return {
      ...player,
      age: 0,
      location: "",
      preferredArea: "",
      availability: [],
      availabilityTags: [],
      sportPreferences: [player.sport],
      playStyle: player.blurb,
      completedMatches: 0,
      rating: 0,
      reviewSnippets: [],
      badges: [],
    }
  })
}

export function findMatchedPlayers(
  prompt: string,
  players: Player[],
  selectedSport: SportKey | "all",
  userLevel: Level
): { intent: PlayerMatchIntent; matches: PlayerMatchResult[] } {
  const intent = parsePlayerIntent(prompt, selectedSport, userLevel)
  const profiles = buildPlayerProfiles(players)

  const matches = profiles
    .filter((profile) => !intent.sport || profile.sport === intent.sport)
    .map((profile) => {
      let score = 0
      const reasons: string[] = []

      if (!intent.sport || profile.sport === intent.sport) {
        score += 30
        reasons.push("same sport")
      }

      if (
        intent.targetLevel &&
        levelDistance(profile.level, intent.targetLevel) <= 1
      ) {
        score += 25
        reasons.push(
          profile.level === intent.targetLevel
            ? "same level"
            : "close skill level"
        )
      }

      if (intent.location) {
        if (
          normalize(profile.location).includes(intent.location) ||
          normalize(profile.preferredArea).includes(intent.location)
        ) {
          score += 20
          reasons.push("near your area")
        }
      } else if (profile.distanceKm <= 3) {
        score += 20
        reasons.push("near you")
      }

      if (intent.timeKey) {
        if (profile.availabilityTags.includes(intent.timeKey)) {
          score += 15
          reasons.push(`available ${intent.timeLabel?.toLowerCase() ?? "now"}`)
        }
      } else if (profile.online) {
        score += 15
        reasons.push("ready to coordinate")
      }

      if (profile.trust >= 85) {
        score += 10
        reasons.push("high trust score")
      }

      const matchPct = Math.max(32, Math.min(98, score))
      const reason =
        reasons.length > 0
          ? reasons.slice(0, 3).join(", ")
          : "strong overall fit for your request"

      return {
        ...profile,
        score,
        matchPct,
        reason: reason.charAt(0).toUpperCase() + reason.slice(1),
      }
    })
    .filter((profile) => profile.score > 0)
    .sort((a, b) => b.matchPct - a.matchPct || b.trust - a.trust)

  const strictLocationNoMatch =
    Boolean(intent.location) &&
    matches.every(
      (profile) =>
        !normalize(profile.location).includes(intent.location ?? "") &&
        !normalize(profile.preferredArea).includes(intent.location ?? "")
    )

  if (strictLocationNoMatch) {
    return { intent, matches: [] }
  }

  return { intent, matches }
}

export function chooseSuggestedCourt(
  courts: Court[],
  sport: SportKey | null,
  locationLabel: string | null
) {
  const pool = courts.filter((court) => !sport || court.sports.includes(sport))
  const byArea = locationLabel
    ? pool.filter((court) => normalize(court.ward) === normalize(locationLabel))
    : []
  const candidates = byArea.length ? byArea : pool.length ? pool : courts
  return (
    [...candidates].sort(
      (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    )[0] ?? null
  )
}

export function summarizeInviteDay(timeKey: MatchTimeKey | null) {
  switch (timeKey) {
    case "tonight":
      return { dayKey: "today", dayLabel: "Today", slot: "19:00" }
    case "tomorrow":
      return { dayKey: "tomorrow", dayLabel: "Tomorrow", slot: "19:00" }
    case "saturday":
      return { dayKey: "sat", dayLabel: "Saturday", slot: "18:00" }
    case "weekend":
    case "this-weekend":
      return { dayKey: "sat", dayLabel: "Saturday", slot: "18:00" }
    default:
      return { dayKey: "today", dayLabel: "Today", slot: "19:00" }
  }
}
