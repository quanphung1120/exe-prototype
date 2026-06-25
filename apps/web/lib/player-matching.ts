import type {
  Court,
  Level,
  Player,
  SportKey,
} from "@/components/dashboard/data"

export type AiIntentKind = "court" | "player"
export type MatchTimeKey =
  | "tonight"
  | "tomorrow"
  | "saturday"
  | "weekend"
  | "this-weekend"

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

interface ProfileFixture {
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

const PLAYER_FIXTURES: Record<string, ProfileFixture> = {
  p1: {
    age: 27,
    location: "District 7",
    preferredArea: "District 7",
    availability: ["Tonight 19:00-22:00", "Saturday 18:00-21:30"],
    availabilityTags: ["tonight", "saturday", "weekend", "this-weekend"],
    sportPreferences: ["badminton"],
    playStyle: "Fast attacking doubles, likes structured rotations",
    completedMatches: 54,
    rating: 4.8,
    reviewSnippets: [
      "Shows up early and keeps rallies organized.",
      "Strong communication when pairing with new players.",
    ],
    badges: ["Verified", "On-time player", "Friendly"],
  },
  p2: {
    age: 25,
    location: "Binh Thanh",
    preferredArea: "Binh Thanh",
    availability: ["Tonight 20:00-22:00", "Weekend mornings"],
    availabilityTags: ["tonight", "weekend", "this-weekend"],
    sportPreferences: ["pickleball", "badminton"],
    playStyle: "Steady doubles builder, patient in transition points",
    completedMatches: 67,
    rating: 4.9,
    reviewSnippets: [
      "Very easy to coordinate with before a match.",
      "Reliable partner for mixed-skill games.",
    ],
    badges: ["Verified", "Friendly"],
  },
  p3: {
    age: 31,
    location: "Thu Duc",
    preferredArea: "Thu Duc",
    availability: ["Saturday 17:00-21:00", "Sunday 08:00-11:00"],
    availabilityTags: ["saturday", "weekend", "this-weekend"],
    sportPreferences: ["pickleball"],
    playStyle: "All-court singles player who also anchors doubles defense",
    completedMatches: 49,
    rating: 4.6,
    reviewSnippets: [
      "Good tactical player and still friendly to new groups.",
      "Clear about schedule and level expectations.",
    ],
    badges: ["Verified", "Competitive"],
  },
  p4: {
    age: 22,
    location: "District 7",
    preferredArea: "District 7",
    availability: ["Tonight 18:30-21:00", "Tomorrow after work"],
    availabilityTags: ["tonight", "tomorrow"],
    sportPreferences: ["pickleball", "badminton"],
    playStyle: "Social rally player, likes casual doubles and rotation drills",
    completedMatches: 21,
    rating: 4.4,
    reviewSnippets: [
      "Positive energy and quick to join group plans.",
      "Still improving but very coachable.",
    ],
    badges: ["Friendly"],
  },
  p5: {
    age: 29,
    location: "Phu Nhuan",
    preferredArea: "Phu Nhuan",
    availability: ["Weekend evenings", "Saturday 19:00-22:00"],
    availabilityTags: ["saturday", "weekend", "this-weekend"],
    sportPreferences: ["pickleball"],
    playStyle: "Competitive finisher with strong net pressure",
    completedMatches: 73,
    rating: 4.7,
    reviewSnippets: [
      "High level and still punctual.",
      "Great fit when the group wants serious games.",
    ],
    badges: ["Verified", "On-time player"],
  },
  p6: {
    age: 26,
    location: "District 3",
    preferredArea: "District 3",
    availability: ["Tonight 19:30-22:30", "This weekend afternoons"],
    availabilityTags: ["tonight", "weekend", "this-weekend"],
    sportPreferences: ["badminton"],
    playStyle: "Quick front-court doubles player with fast hands",
    completedMatches: 38,
    rating: 4.5,
    reviewSnippets: [
      "Adapts well to different levels.",
      "Keeps the match fun and on pace.",
    ],
    badges: ["Friendly", "On-time player"],
  },
}

const SPORT_ALIASES: Record<SportKey, string[]> = {
  badminton: ["badminton", "cau long", "cau-long"],
  pickleball: ["pickleball", "pickle"],
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
    const fixture = PLAYER_FIXTURES[player.id]
    return {
      ...player,
      age: fixture?.age ?? 25,
      location: fixture?.location ?? "District 1",
      preferredArea: fixture?.preferredArea ?? "District 1",
      availability: fixture?.availability ?? ["Tonight 19:00-21:00"],
      availabilityTags: fixture?.availabilityTags ?? ["tonight"],
      sportPreferences: fixture?.sportPreferences ?? [player.sport],
      playStyle: fixture?.playStyle ?? player.blurb,
      completedMatches: fixture?.completedMatches ?? 20,
      rating: fixture?.rating ?? 4.5,
      reviewSnippets: fixture?.reviewSnippets ?? [],
      badges: fixture?.badges ?? [],
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
    ? pool.filter(
        (court) => normalize(court.district) === normalize(locationLabel)
      )
    : []
  const candidates = byArea.length ? byArea : pool.length ? pool : courts
  return [...candidates].sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null
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
