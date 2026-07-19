import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { Notification, NotificationSchema } from "./notification.schema.js"
import { NotificationsController } from "./notifications.controller.js"
import { NotificationsService } from "./notifications.service.js"

// A leaf module (no feature-module deps of its own) so `BookingsModule`,
// `VenuesModule` and `PaymentsModule` can each import it directly for their
// notification producer call sites without risking a module cycle.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
