import { Module } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { MongooseModule } from "@nestjs/mongoose"
import { StreamChat } from "stream-chat"

import {
  StreamSeedState,
  StreamSeedStateSchema,
} from "./stream-seed.schema.js"
import { StreamController } from "./stream.controller.js"
import { STREAM_CLIENT, StreamService } from "./stream.service.js"

// Stream Chat feature: the token/channel endpoints plus the seed-state marker
// collection. The server-side StreamChat client is a factory provider (bound to
// STREAM_CLIENT) built from the validated Stream credentials, so tests can swap
// in a fake via the same token.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StreamSeedState.name, schema: StreamSeedStateSchema },
    ]),
  ],
  controllers: [StreamController],
  providers: [
    StreamService,
    {
      provide: STREAM_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        StreamChat.getInstance(
          config.getOrThrow<string>("STREAM_API_KEY"),
          config.getOrThrow<string>("STREAM_API_SECRET")
        ),
    },
  ],
  exports: [StreamService],
})
export class StreamModule {}
