import { Module } from "@nestjs/common"

import { VenuesModule } from "../venues/venues.module.js"
import { VenueWorkspaceController } from "./venue-workspace.controller.js"

// Read/setup endpoints for the operator workspace, split out from VenuesModule
// (which owns the CRUD routes + Venue schema). Both depend on the same
// VenuesService, imported here rather than duplicated.
@Module({
  imports: [VenuesModule],
  controllers: [VenueWorkspaceController],
})
export class VenueWorkspaceModule {}
