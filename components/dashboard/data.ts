// Mock data for the SportMatch AI player dashboard.
// All values are static so server and client renders stay in sync.

export type SportKey = "tennis" | "pickleball" | "badminton"

export interface Sport {
  key: SportKey
  label: string
  short: string
  /** Tailwind background class used for the sport's accent dot/tag. */
  accent: string
}

export const SPORTS: Sport[] = [
  { key: "tennis", label: "Tennis", short: "TN", accent: "bg-chart-2" },
  { key: "pickleball", label: "Pickleball", short: "PK", accent: "bg-lime" },
  { key: "badminton", label: "Badminton", short: "BD", accent: "bg-chart-3" },
]

const sportBy = (k: SportKey) => SPORTS.find((s) => s.key === k)
export const sportLabel = (k: SportKey) => sportBy(k)?.label ?? k
export const sportShort = (k: SportKey) => sportBy(k)?.short ?? "??"
export const sportAccent = (k: SportKey) => sportBy(k)?.accent ?? "bg-muted"

/** Format a VND amount as a compact "180K" string. */
export const formatVnd = (vnd: number) => `${Math.round(vnd / 1000)}K`

export const USER = {
  name: "Nguyễn Minh",
  first: "Minh",
  initials: "NM",
  handle: "@minh",
  city: "Hà Nội",
  tier: "Intermediate",
  rating: 4.12,
  ratingDelta: 0.08,
  /** Reliability/reputation score, 0–100. */
  trust: 92,
}

export interface Player {
  id: string
  name: string
  initials: string
  rating: number
  sport: SportKey
  distanceKm: number
  /** AI compatibility score, 0–100. */
  matchPct: number
  /** Reliability/reputation score, 0–100. */
  trust: number
  online: boolean
  blurb: string
}

export const MATCH_SUGGESTIONS: Player[] = [
  {
    id: "p1",
    name: "Trần Huy",
    initials: "TH",
    rating: 4.18,
    sport: "badminton",
    distanceKm: 1.2,
    matchPct: 96,
    trust: 88,
    online: true,
    blurb: "Plays evenings · aggressive baseliner",
  },
  {
    id: "p2",
    name: "Lê Lan",
    initials: "LL",
    rating: 4.05,
    sport: "pickleball",
    distanceKm: 2.4,
    matchPct: 92,
    trust: 95,
    online: true,
    blurb: "Looking for doubles partner",
  },
  {
    id: "p3",
    name: "Phạm Quân",
    initials: "PQ",
    rating: 4.21,
    sport: "tennis",
    distanceKm: 3.1,
    matchPct: 89,
    trust: 84,
    online: false,
    blurb: "Weekend singles · all-court",
  },
  {
    id: "p4",
    name: "Đỗ Anh",
    initials: "ĐA",
    rating: 3.98,
    sport: "pickleball",
    distanceKm: 0.8,
    matchPct: 87,
    trust: 79,
    online: true,
    blurb: "New to the area, very social",
  },
  {
    id: "p5",
    name: "Vũ Hà",
    initials: "VH",
    rating: 4.3,
    sport: "tennis",
    distanceKm: 4.6,
    matchPct: 84,
    trust: 91,
    online: false,
    blurb: "Competitive · league regular",
  },
  {
    id: "p6",
    name: "Bùi Khang",
    initials: "BK",
    rating: 4.09,
    sport: "badminton",
    distanceKm: 2.0,
    matchPct: 81,
    trust: 76,
    online: true,
    blurb: "Fast hands, fun rallies",
  },
]

/** A participant resolvable from a match room's `players` initials. */
export interface RosterEntry {
  name: string
  initials: string
  /** Skill rating, when the participant is a known player. */
  rating?: number
  /** Reliability/reputation score, 0–100. */
  trust: number
}

// Everyone a room's `players` initials can refer to: the user + suggestions.
const ROSTER: RosterEntry[] = [
  {
    name: USER.name,
    initials: USER.initials,
    rating: USER.rating,
    trust: USER.trust,
  },
  ...MATCH_SUGGESTIONS.map((p) => ({
    name: p.name,
    initials: p.initials,
    rating: p.rating,
    trust: p.trust,
  })),
]

/** Resolve a room participant's initials to their name, rating and trust. */
export function playerByInitials(initials: string): RosterEntry {
  return (
    ROSTER.find((p) => p.initials === initials) ?? {
      name: initials,
      initials,
      trust: 70,
    }
  )
}

export type TrustTier = "trusted" | "reliable" | "new"

/** Bucket a 0–100 trust score into a reputation tier. */
export function trustTier(trust: number): TrustTier {
  if (trust >= 85) return "trusted"
  if (trust >= 70) return "reliable"
  return "new"
}

/** Text-color class for each trust tier (kept on the emerald/lime theme). */
export const trustTierAccent: Record<TrustTier, string> = {
  trusted: "text-brand",
  reliable: "text-chart-3",
  new: "text-muted-foreground",
}

export interface Court {
  id: string
  name: string
  district: string
  sports: SportKey[]
  surface: string
  pricePerHour: number
  distanceKm: number
  rating: number
  openSlots: number
  nextSlot: string
  /** Share of today's slots still free, 0–100. */
  freePct: number
}

export const COURTS: Court[] = [
  {
    id: "c1",
    name: "Shuttle Republic",
    district: "Cầu Giấy",
    sports: ["badminton"],
    surface: "Sprung timber · indoor",
    pricePerHour: 360000,
    distanceKm: 1.2,
    rating: 4.8,
    openSlots: 5,
    nextSlot: "18:30",
    freePct: 42,
  },
  {
    id: "c2",
    name: "Ace Tennis Club",
    district: "Tây Hồ",
    sports: ["tennis"],
    surface: "Hard · Plexicushion",
    pricePerHour: 220000,
    distanceKm: 2.6,
    rating: 4.7,
    openSlots: 3,
    nextSlot: "19:00",
    freePct: 28,
  },
  {
    id: "c3",
    name: "Smash Pickleball",
    district: "Đống Đa",
    sports: ["pickleball", "badminton"],
    surface: "Cushioned acrylic",
    pricePerHour: 150000,
    distanceKm: 0.9,
    rating: 4.6,
    openSlots: 8,
    nextSlot: "17:45",
    freePct: 64,
  },
  {
    id: "c4",
    name: "Rally Point Club",
    district: "Ba Đình",
    sports: ["tennis", "pickleball"],
    surface: "Clay · outdoor",
    pricePerHour: 280000,
    distanceKm: 3.4,
    rating: 4.5,
    openSlots: 2,
    nextSlot: "20:15",
    freePct: 18,
  },
  {
    id: "c5",
    name: "Topspin Center",
    district: "Long Biên",
    sports: ["badminton", "pickleball"],
    surface: "Sprung timber",
    pricePerHour: 130000,
    distanceKm: 5.1,
    rating: 4.4,
    openSlots: 6,
    nextSlot: "18:00",
    freePct: 51,
  },
  {
    id: "c6",
    name: "Baseline Athletic",
    district: "Hai Bà Trưng",
    sports: ["tennis"],
    surface: "Hard · acrylic",
    pricePerHour: 170000,
    distanceKm: 4.0,
    rating: 4.6,
    openSlots: 4,
    nextSlot: "19:30",
    freePct: 37,
  },
]

/** An open match lobby other players can join (Match Maker). */
export interface MatchRoom {
  id: string
  host: { name: string; initials: string }
  title: string
  sport: SportKey
  format: "Singles" | "Doubles"
  venue: string
  district: string
  distanceKm: number
  day: string
  time: string
  /** Skill window the host is happy to play, inclusive. */
  skillMin: number
  skillMax: number
  /** Total seats including the host. */
  capacity: number
  /** Seats already taken. `players` holds their initials. */
  joined: number
  players: string[]
  pricePerHour: number
}

export const ROOMS: MatchRoom[] = [
  {
    id: "r1",
    host: { name: "Trần Huy", initials: "TH" },
    title: "Evening badminton, friendly doubles",
    sport: "badminton",
    format: "Doubles",
    venue: "Shuttle Republic",
    district: "Cầu Giấy",
    distanceKm: 1.2,
    day: "Today",
    time: "18:30 – 19:30",
    skillMin: 3.8,
    skillMax: 4.4,
    capacity: 4,
    joined: 2,
    players: ["TH", "LL"],
    pricePerHour: 360000,
  },
  {
    id: "r2",
    host: { name: "Phạm Quân", initials: "PQ" },
    title: "Competitive tennis singles",
    sport: "tennis",
    format: "Singles",
    venue: "Ace Tennis Club",
    district: "Tây Hồ",
    distanceKm: 2.6,
    day: "Today",
    time: "19:00 – 20:00",
    skillMin: 4.0,
    skillMax: 4.6,
    capacity: 2,
    joined: 1,
    players: ["PQ"],
    pricePerHour: 220000,
  },
  {
    id: "r3",
    host: { name: "Đỗ Anh", initials: "ĐA" },
    title: "Casual pickleball rally",
    sport: "pickleball",
    format: "Doubles",
    venue: "Smash Pickleball",
    district: "Đống Đa",
    distanceKm: 0.9,
    day: "Today",
    time: "17:45 – 18:45",
    skillMin: 3.5,
    skillMax: 4.2,
    capacity: 4,
    joined: 3,
    players: ["ĐA", "VH", "BK"],
    pricePerHour: 150000,
  },
  {
    id: "r4",
    host: { name: "Vũ Hà", initials: "VH" },
    title: "Advanced pickleball doubles",
    sport: "pickleball",
    format: "Doubles",
    venue: "Rally Point Club",
    district: "Ba Đình",
    distanceKm: 3.4,
    day: "Today",
    time: "20:15 – 21:15",
    skillMin: 4.3,
    skillMax: 4.9,
    capacity: 4,
    joined: 2,
    players: ["VH", "PQ"],
    pricePerHour: 280000,
  },
  {
    id: "r5",
    host: { name: "Lê Lan", initials: "LL" },
    title: "Badminton doubles night",
    sport: "badminton",
    format: "Doubles",
    venue: "Topspin Center",
    district: "Long Biên",
    distanceKm: 5.1,
    day: "Tomorrow",
    time: "18:00 – 19:00",
    skillMin: 3.6,
    skillMax: 4.3,
    capacity: 4,
    joined: 4,
    players: ["LL", "BK", "ĐA", "TH"],
    pricePerHour: 130000,
  },
  {
    id: "r6",
    host: { name: "Bùi Khang", initials: "BK" },
    title: "Tennis doubles, all welcome",
    sport: "tennis",
    format: "Doubles",
    venue: "Rally Point Club",
    district: "Ba Đình",
    distanceKm: 3.4,
    day: "Tomorrow",
    time: "19:00 – 20:00",
    skillMin: 3.9,
    skillMax: 4.5,
    capacity: 4,
    joined: 1,
    players: ["BK"],
    pricePerHour: 280000,
  },
]

/** Preset start times offered when hosting a room. */
export const ROOM_TIME_SLOTS = [
  "Today 18:30 – 19:30",
  "Today 19:30 – 20:30",
  "Today 20:30 – 21:30",
  "Tomorrow 07:00 – 08:00",
  "Tomorrow 19:00 – 20:00",
  "Sat 09:30 – 10:30",
]

export type OpenToKey = "my-level" | "any" | "above"

/** How wide a skill window each "open to" preset spans around a rating. */
export const OPEN_TO: { value: OpenToKey; label: string }[] = [
  { value: "my-level", label: "My level (±0.3)" },
  { value: "any", label: "Any level" },
  { value: "above", label: "Stronger players" },
]

export function skillWindow(
  openTo: OpenToKey,
  rating: number
): [number, number] {
  if (openTo === "any") return [1, 7]
  if (openTo === "above") return [rating, rating + 0.8]
  return [Math.max(1, rating - 0.3), rating + 0.3]
}

export type BookingStatus = "confirmed" | "pending" | "completed" | "cancelled"

export interface Booking {
  id: string
  sport: SportKey
  format: "Singles" | "Doubles"
  venue: string
  court: string
  day: string
  time: string
  status: BookingStatus
  withPlayers: { name: string; initials: string }[]
  result?: "W" | "L"
  score?: string
}

export const BOOKINGS: Booking[] = [
  {
    id: "b1",
    sport: "badminton",
    format: "Doubles",
    venue: "Shuttle Republic",
    court: "Court 3",
    day: "Today",
    time: "18:30 – 19:30",
    status: "confirmed",
    withPlayers: [
      { name: "Trần Huy", initials: "TH" },
      { name: "Lê Lan", initials: "LL" },
    ],
  },
  {
    id: "b2",
    sport: "tennis",
    format: "Singles",
    venue: "Ace Tennis Club",
    court: "Court 1",
    day: "Tomorrow",
    time: "07:00 – 08:00",
    status: "confirmed",
    withPlayers: [{ name: "Phạm Quân", initials: "PQ" }],
  },
  {
    id: "b3",
    sport: "pickleball",
    format: "Doubles",
    venue: "Smash Pickleball",
    court: "Court 2",
    day: "Sat, 21 Jun",
    time: "09:30 – 10:30",
    status: "pending",
    withPlayers: [
      { name: "Đỗ Anh", initials: "ĐA" },
      { name: "Vũ Hà", initials: "VH" },
    ],
  },
  {
    id: "b4",
    sport: "tennis",
    format: "Doubles",
    venue: "Rally Point Club",
    court: "Court 5",
    day: "Mon, 16 Jun",
    time: "20:00 – 21:00",
    status: "completed",
    withPlayers: [
      { name: "Bùi Khang", initials: "BK" },
      { name: "Lê Lan", initials: "LL" },
    ],
    result: "W",
    score: "6–3, 6–4",
  },
  {
    id: "b5",
    sport: "tennis",
    format: "Singles",
    venue: "Ace Tennis Club",
    court: "Court 2",
    day: "Fri, 13 Jun",
    time: "18:00 – 19:00",
    status: "completed",
    withPlayers: [{ name: "Vũ Hà", initials: "VH" }],
    result: "L",
    score: "4–6, 6–7",
  },
]

export interface Chat {
  id: string
  name: string
  initials: string
  last: string
  time: string
  unread: number
  online: boolean
  group: boolean
}

export const CHATS: Chat[] = [
  {
    id: "ch1",
    name: "Badminton Crew",
    initials: "BC",
    last: "Huy: See you at Court 3 at 6:30 👊",
    time: "12m",
    unread: 2,
    online: true,
    group: true,
  },
  {
    id: "ch2",
    name: "Trần Huy",
    initials: "TH",
    last: "Bring an extra grip if you have one",
    time: "1h",
    unread: 0,
    online: true,
    group: false,
  },
  {
    id: "ch3",
    name: "Lê Lan",
    initials: "LL",
    last: "Confirmed for tonight ✅",
    time: "3h",
    unread: 0,
    online: false,
    group: false,
  },
  {
    id: "ch4",
    name: "Phạm Quân",
    initials: "PQ",
    last: "Rematch this weekend? 🎾",
    time: "Yesterday",
    unread: 0,
    online: false,
    group: false,
  },
]

export interface Message {
  id: string
  mine: boolean
  author: string
  text: string
  time: string
}

export const THREAD: Message[] = [
  {
    id: "m1",
    mine: false,
    author: "Trần Huy",
    text: "Court 3 is booked for tonight 🔥",
    time: "17:42",
  },
  {
    id: "m2",
    mine: false,
    author: "Lê Lan",
    text: "Confirmed for tonight ✅",
    time: "17:45",
  },
  {
    id: "m3",
    mine: true,
    author: "Minh",
    text: "Perfect. I'll warm up the serves 😅",
    time: "17:48",
  },
  {
    id: "m4",
    mine: false,
    author: "Trần Huy",
    text: "See you at Court 3 at 6:30 👊",
    time: "17:51",
  },
]

export const STREAK = {
  current: 6,
  longest: 14,
  weeklyGoal: 5,
  weeklyDone: 4,
  // Last seven days, oldest → today.
  week: [
    { day: "M", active: true, sport: "tennis" as SportKey },
    { day: "T", active: true, sport: "badminton" as SportKey },
    { day: "W", active: false, sport: null },
    { day: "T", active: true, sport: "pickleball" as SportKey },
    { day: "F", active: true, sport: "pickleball" as SportKey },
    { day: "S", active: true, sport: "tennis" as SportKey },
    { day: "S", active: false, sport: null, today: true },
  ] as {
    day: string
    active: boolean
    sport: SportKey | null
    today?: boolean
  }[],
  // 12 weeks × 7 days of activity intensity (0–3) for the heatmap, oldest first.
  history: [
    0, 1, 0, 2, 1, 0, 0, 1, 0, 1, 2, 0, 1, 0, 0, 2, 1, 3, 1, 0, 1, 0, 1, 0, 2,
    0, 1, 1, 1, 0, 2, 1, 0, 1, 2, 0, 0, 1, 0, 2, 1, 1, 2, 0, 1, 3, 1, 0, 2, 1,
    1, 0, 1, 2, 0, 1, 0, 2, 1, 3, 1, 0, 1, 2, 1, 0, 2, 1, 3, 2, 1, 0, 2, 1, 1,
    2, 0, 1, 2, 1, 3, 2, 1, 0,
  ],
}

export const STATS = {
  matches: 48,
  winRate: 67,
  rating: USER.rating,
  ratingDelta: USER.ratingDelta,
  hours: 32,
  hoursDelta: 5,
}

export type ActivityKind = "match-found" | "win" | "loss" | "booking" | "rating"

export interface ActivityItem {
  id: string
  kind: ActivityKind
  text: string
  time: string
}

export const ACTIVITY: ActivityItem[] = [
  {
    id: "a1",
    kind: "match-found",
    text: "AI matched you with Trần Huy for badminton tonight",
    time: "2h ago",
  },
  {
    id: "a2",
    kind: "rating",
    text: "Your skill rating rose to 4.12 (+0.08)",
    time: "Yesterday",
  },
  {
    id: "a3",
    kind: "win",
    text: "Won doubles at Rally Point Club · 6–3, 6–4",
    time: "3 days ago",
  },
  {
    id: "a4",
    kind: "booking",
    text: "Booked Court 1 at Ace Tennis Club",
    time: "4 days ago",
  },
  {
    id: "a5",
    kind: "loss",
    text: "Close singles loss to Vũ Hà · 4–6, 6–7",
    time: "6 days ago",
  },
]
