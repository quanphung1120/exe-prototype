import { Controller, Get } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { PlayerService } from "./player.service.js"
import { ProfileService } from "./profile.service.js"

@Controller()
export class PlayersController {
  constructor(
    private readonly players: PlayerService,
    private readonly profiles: ProfileService
  ) {}

  @Get("me")
  async me(@UserId() userId: string) {
    const { user, streak, stats } = await this.profiles.getProfile(userId)
    return { user, streak, stats }
  }

  @Get("players")
  listPlayers() {
    return this.players.listPlayers()
  }

  @Get("rooms")
  async rooms(@UserId() userId: string) {
    return (await this.profiles.getProfile(userId)).rooms
  }

  @Get("bookings")
  async bookings(@UserId() userId: string) {
    return (await this.profiles.getProfile(userId)).bookings
  }

  @Get("chats")
  async chats(@UserId() userId: string) {
    return (await this.profiles.getProfile(userId)).chats
  }

  @Get("chats/thread")
  async thread(@UserId() userId: string) {
    return (await this.profiles.getProfile(userId)).thread
  }

  @Get("activity")
  async activity(@UserId() userId: string) {
    return (await this.profiles.getProfile(userId)).activity
  }

  @Get("notifications")
  async notifications(@UserId() userId: string) {
    return (await this.profiles.getProfile(userId)).notifications
  }
}
