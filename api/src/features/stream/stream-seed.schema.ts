import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

// A one-row-per-user marker that a user's Stream Chat demo data (users +
// per-user demo channels) has been seeded. Mirrors the seed-on-first-access
// pattern used by the profile store, but here the seeding lands in Stream (not
// Mongo), so this collection only records *whether* it ran — an atomic
// `$setOnInsert` upsert makes concurrent first-token requests race-safe.
@Schema({ collection: "streamseeds", timestamps: true })
export class StreamSeedState {
  // Clerk user id. Explicit `type: String` since tsx (esbuild) doesn't emit the
  // design:type metadata @Prop() would otherwise infer — same as the other
  // feature schemas.
  @Prop({ required: true, unique: true, index: true, type: String })
  userId: string
}

export type StreamSeedStateDocument = HydratedDocument<StreamSeedState>
export const StreamSeedStateSchema =
  SchemaFactory.createForClass(StreamSeedState)
