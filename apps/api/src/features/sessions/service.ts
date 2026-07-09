// MongoDB-backed service for players' persisted PlaySessions. The web dashboard
// runs all matchmaking/booking logic client-side over one `sessions` array;
// this service is the durable, per-user mirror of the sessions a signed-in user
// creates or changes. Reads feed the seed merge (buildSeed); writes are driven
// by the web's session server actions when a booking is confirmed, a room is
// opened, or a session is cancelled.

import type { PlaySession } from "@repo/shared"

import { connectDb } from "../../lib/db.js"
import { NotFoundError } from "../../lib/errors.js"
import { SessionModel } from "./model.js"

const ORDER = { createdAt: 1, _id: 1 } as const

/** Every PlaySession this user has persisted, oldest first. */
export async function listUserSessions(userId: string): Promise<PlaySession[]> {
  await connectDb()
  const docs = await SessionModel.find({ userId }).sort(ORDER).lean()
  return docs.map((d) => d.data)
}

/** Insert or replace one of the user's sessions (keyed by the client id). */
export async function upsertSession(
  userId: string,
  session: PlaySession
): Promise<PlaySession> {
  await connectDb()
  await SessionModel.updateOne(
    { userId, sessionId: session.id },
    { $set: { data: session } },
    { upsert: true }
  )
  return session
}

/** Drop one of the user's sessions; throws `NotFoundError` when nothing matched. */
export async function deleteSession(
  userId: string,
  sessionId: string
): Promise<void> {
  await connectDb()
  const res = await SessionModel.deleteOne({ userId, sessionId })
  if (res.deletedCount === 0) throw new NotFoundError("Session not found")
}
