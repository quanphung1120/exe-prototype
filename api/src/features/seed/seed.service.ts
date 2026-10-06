import { Inject, Injectable } from "@nestjs/common"

import { vnNowIso, type Seed } from "../../shared/index.js"

import { resolveAccountType } from "../account/account.service.js"
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
    // Explicit `@Inject()` tokens (not just the TS type) since esbuild-based
    // runners like tsx don't emit the design:paramtypes metadata implicit
    // constructor injection would otherwise rely on — see the same note on
    // PaymentsService's constructor.
    @Inject(CourtsService) private readonly courts: CourtsService,
    @Inject(PlayerService) private readonly players: PlayerService,
    @Inject(ProfileService) private readonly profiles: ProfileService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(VenuesService) private readonly venues: VenuesService,
    @Inject(AssessmentService) private readonly assessment: AssessmentService
  ) {}

  /**
   * The complete seed payload (player + venue). Each account owns exactly one
   * venue: `venues` is `[theirVenue]` (or `[]` when unprovisioned — the web gates
   * on this to route new accounts into setup) and `venue` carries that venue's
   * bundle. `userId` also drives the personal half: their profile plus their
   * persisted PlaySessions.
   */
  async buildSeed(userId?: string): Promise<Seed> {
    const serverNow = vnNowIso()
    const [
      courts,
      venuePins,
      players,
      profile,
      userSessions,
      assessment,
      workspace,
    ] = await Promise.all([
      this.courts.listCourts(),
      this.venues.catalogVenues(),
      this.players.listPlayers(),
      userId
        ? this.profiles.getProfile(userId)
        : Promise.resolve(this.profiles.defaultProfile()),
      userId ? this.sessions.listUserSessions(userId) : Promise.resolve([]),
      userId
        ? this.assessment.getUserAssessment(userId)
        : Promise.resolve(null),
      // `myWorkspace` depends only on `userId`, so it joins this batch too —
      // only the venue bundle below stays dependent (it needs `venues[0]`).
      userId
        ? this.venues.myWorkspace(userId)
        : Promise.resolve({ brand: null, venues: [] }),
    ])

    // Only the user's own persisted sessions — no demo sessions are derived any
    // more.
    const sessions = userSessions

    // The caller's brand and its branches (chi nhánh), or none yet. When they
    // have none, `venues` is empty (the web redirects to setup) and `venue`
    // carries a zeroed, no-query fallback bundle never rendered before that
    // redirect (`emptyBundle` — no player-surface component reads `seed.venue`).
    // `activeVenueId` defaults to the first branch; the web overrides it from the
    // `/app/venue/[venueId]` URL segment.
    const { brand, venues } = workspace
    const activeVenueId = venues[0]?.id ?? null
    const venue = activeVenueId
      ? await this.venues.venueBundle(activeVenueId)
      : this.venues.emptyBundle()

    const accountType = resolveAccountType(
      profile.accountType,
      assessment !== null,
      venues.length > 0
    )

    return {
      serverNow,
      user: profile.user,
      players,
      courts,
      venuePins,
      rooms: profile.rooms,
      bookings: profile.bookings,
      sessions,
      streak: profile.streak,
      stats: profile.stats,
      activity: profile.activity,
      notifications: profile.notifications,
      brand,
      venues,
      activeVenueId: activeVenueId ?? "",
      venue,
      assessment,
      accountType,
    }
  }
}
