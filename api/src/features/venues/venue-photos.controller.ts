import { Body, Controller, Param, Post, Put } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { UserThrottle } from "../../common/user-throttler.guard.js"
import { VenueIdParamDto, VenuePhotosBodyDto } from "./venues.dto.js"
import { VenuePhotosService } from "./venue-photos.service.js"
import { VenuesService } from "./venues.service.js"

// A venue's photo gallery, under /api/venues/:venueId/photos. Only the venue's
// operator may sign uploads or change the gallery (`assertOwnsVenue`: 404 for
// an unknown venue, 403 for another account's).
@Controller("venues/:venueId/photos")
export class VenuePhotosController {
  constructor(
    private readonly venues: VenuesService,
    private readonly photos: VenuePhotosService
  ) {}

  /** A signature for one direct browser → Cloudinary upload. */
  @UserThrottle({ limit: 30, ttl: 60_000 })
  @Post("signature")
  async signature(@UserId() userId: string, @Param() param: VenueIdParamDto) {
    await this.venues.assertOwnsVenue(userId, param.venueId)
    return this.photos.signUpload(param.venueId)
  }

  /** Replace the gallery (order = display order, first = cover). */
  @Put()
  async setPhotos(
    @UserId() userId: string,
    @Param() param: VenueIdParamDto,
    @Body() body: VenuePhotosBodyDto
  ) {
    await this.venues.assertOwnsVenue(userId, param.venueId)
    return { photos: await this.photos.setPhotos(param.venueId, body.photos) }
  }
}
