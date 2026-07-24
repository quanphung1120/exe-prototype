import { Module } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { MongooseModule } from "@nestjs/mongoose"
import { createClerkClient } from "@clerk/express"
import { StreamChat } from "stream-chat"

import { Booking, BookingSchema } from "../bookings/booking.schema.js"
import { Venue, VenueSchema } from "../venues/venue.schema.js"
import {
  CLERK_CLIENT,
  ClerkDirectoryService,
} from "./clerk-directory.service.js"
import { StreamSeedState, StreamSeedStateSchema } from "./stream-seed.schema.js"
import { StreamController } from "./stream.controller.js"
import { STREAM_CLIENT, StreamService } from "./stream.service.js"

// Stream Chat feature: the token/channel endpoints plus the seed-state marker
// collection. The server-side StreamChat client is a factory provider (bound to
// STREAM_CLIENT) built from the validated Stream credentials, so tests can swap
// in a fake via the same token. Venue/Booking schemas are registered directly
// here (not via VenuesModule/BookingsModule) — venues.module.ts already imports
// StreamModule (cancel/decline freezes room chats), so importing either of
// those modules back would be circular.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StreamSeedState.name, schema: StreamSeedStateSchema },
      { name: Venue.name, schema: VenueSchema },
      { name: Booking.name, schema: BookingSchema },
    ]),
  ],
  controllers: [StreamController],
  providers: [
    StreamService,
    ClerkDirectoryService,
    {
      provide: STREAM_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        StreamChat.getInstance(
          config.getOrThrow<string>("STREAM_API_KEY"),
          config.getOrThrow<string>("STREAM_API_SECRET")
        ),
    },
    {
      provide: CLERK_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createClerkClient({
          secretKey: config.getOrThrow<string>("CLERK_SECRET_KEY"),
        }),
    },
  ],
  exports: [StreamService],
})
export class StreamModule {}
