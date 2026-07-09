import { Injectable } from "@nestjs/common"

import { buildSeedSessions, type Seed } from "../../shared/index.js"

import { AssessmentService } from "../assessment/assessment.service.js"
import { CourtsService } from "../courts/courts.service.js"
import { PlayerService } from "../players/player.service.js"
import { ProfileService } from "../players/profile.service.js"
import { SessionsService } from "../sessions/sessions.service.js"
import { VenuesService } from "../venues/venues.service.js"

// Assembles the full dataset the web app hydrates in one request (`/api/seed`),
// composing every service: shared discovery data (courts, players) + the signed-
// in user's personal pre-data (profile, assessment) + the DB-backed venue and
// session stores.
@Injectable()
export class SeedService {
  constructor(
    private readonly courts: CourtsService,
    private readonly players: PlayerService,
    private readonly profiles: ProfileService,
    private readonly sessions: SessionsService,
    private readonly venues: VenuesService,
    private readonly assessment: AssessmentService
  ) {}

  /**
   * The complete seed payload (player + venue). `activeVenueId` selects which
   * venue's operator bundle the `venue` key carries (defaults to the first).
   * `userId` drives the personal half: their profile pre-data plus their
   * persisted PlaySessions layered over the demo sessions derived from that
   * profile's rooms/bookings.
   */
  async buildSeed(activeVenueId?: string, userId?: string): Promise<Seed> {
    const [courts, players, profile, userSessions, assessment] =
      await Promise.all([
        this.courts.listCourts(),
        this.players.listPlayers(),
        userId
          ? this.profiles.getProfile(userId)
          : Promise.resolve(this.profiles.defaultProfile()),
        userId
          ? this.sessions.listUserSessions(userId)
          : Promise.resolve([]),
        userId
          ? this.assessment.getUserAssessment(userId)
          : Promise.resolve(null),
      ])

    // The demo sessions are derived from *this user's* profile rooms/bookings, so
    // a fresh user gets the same seed sessions the app has always shipped; their
    // persisted sessions then override any sharing an id.
    const demoSessions = buildSeedSessions(
      profile.rooms,
      profile.bookings,
      courts,
      profile.user,
      players
    )
    const ownIds = new Set(userSessions.map((s) => s.id))
    const sessions = [
      ...userSessions,
      ...demoSessions.filter((s) => !ownIds.has(s.id)),
    ]

    // `listVenues()` already loads every venue profile, so resolve the active id
    // from that in-memory list (falling back to the first venue) instead of a
    // separate DB round-trip; `activeBundle` still fetches the one bundle's ops.
    const [venues, venue] = await Promise.all([
      this.venues.listVenues(),
      this.venues.activeBundle(activeVenueId),
    ])
    const resolvedVenueId =
      (activeVenueId && venues.find((v) => v.id === activeVenueId)?.id) ||
      venues[0]?.id

    return {
      user: profile.user,
      players,
      courts,
      rooms: profile.rooms,
      bookings: profile.bookings,
      sessions,
      chats: profile.chats,
      thread: profile.thread,
      streak: profile.streak,
      stats: profile.stats,
      activity: profile.activity,
      notifications: profile.notifications,
      venues,
      activeVenueId: resolvedVenueId,
      venue,
      assessment,
    }
  }
}
