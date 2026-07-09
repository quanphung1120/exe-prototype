import { Injectable, NotFoundException } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import type { PlaySession as PlaySessionData } from "../../shared/index.js"

import { PlaySession, type PlaySessionDocument } from "./session.schema.js"

const ORDER = { createdAt: 1, _id: 1 } as const

// MongoDB-backed service for players' persisted PlaySessions — the durable,
// per-user mirror of the sessions a signed-in user creates or changes. Reads feed
// the seed merge (SeedService); writes are driven by the web's session actions.
@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(PlaySession.name)
    private readonly sessionModel: Model<PlaySessionDocument>
  ) {}

  /** Every PlaySession this user has persisted, oldest first. */
  async listUserSessions(userId: string): Promise<PlaySessionData[]> {
    const docs = await this.sessionModel.find({ userId }).sort(ORDER).lean()
    return docs.map((d) => d.data)
  }

  /** Insert or replace one of the user's sessions (keyed by the client id). */
  async upsertSession(
    userId: string,
    session: PlaySessionData
  ): Promise<PlaySessionData> {
    await this.sessionModel.updateOne(
      { userId, sessionId: session.id },
      { $set: { data: session } },
      { upsert: true }
    )
    return session
  }

  /** Drop one of the user's sessions; throws NotFound when nothing matched. */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const res = await this.sessionModel.deleteOne({ userId, sessionId })
    if (res.deletedCount === 0) throw new NotFoundException("Session not found")
  }
}
