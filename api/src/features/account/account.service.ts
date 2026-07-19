import { Injectable } from "@nestjs/common"

import type { AccountType } from "../../shared/index.js"

import { ProfileService } from "../players/profile.service.js"
import { AssessmentService } from "../assessment/assessment.service.js"
import { VenuesService } from "../venues/venues.service.js"

/**
 * Effective account type = stored choice ∪ inferred facts: a completed
 * assessment implies the player role, an owned venue implies the venue role.
 * So a player-only account that provisions a venue becomes "both" for free
 * (no extra write needed), and likewise the other way round.
 */
export function resolveAccountType(
  stored: AccountType | null,
  hasAssessment: boolean,
  hasVenue: boolean
): AccountType | null {
  const wantsPlayer = stored === "player" || stored === "both" || hasAssessment
  const wantsVenue = stored === "venue" || stored === "both" || hasVenue
  if (wantsPlayer && wantsVenue) return "both"
  if (wantsPlayer) return "player"
  if (wantsVenue) return "venue"
  return stored
}

@Injectable()
export class AccountService {
  constructor(
    private readonly profiles: ProfileService,
    private readonly assessment: AssessmentService,
    private readonly venues: VenuesService
  ) {}

  async getAccountType(userId: string): Promise<AccountType | null> {
    const [profile, assessmentData, myVenueId] = await Promise.all([
      this.profiles.getProfile(userId),
      this.assessment.getUserAssessment(userId),
      this.venues.myVenueId(userId),
    ])
    return resolveAccountType(
      profile.accountType,
      assessmentData !== null,
      myVenueId !== null
    )
  }

  async chooseAccountType(
    userId: string,
    accountType: AccountType
  ): Promise<AccountType | null> {
    await this.profiles.setAccountType(userId, accountType)
    return this.getAccountType(userId)
  }
}
