import { createHash } from "node:crypto"

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import { withVersionRetry } from "../../common/mongo-util.js"
import { Venue, type VenueDocument } from "./venue.schema.js"

/** Most photos one venue may show. */
export const MAX_VENUE_PHOTOS = 8
/** Image formats Cloudinary accepts for a venue photo (enforced by the signature). */
export const VENUE_PHOTO_FORMATS = "jpg,jpeg,png,webp"

/** Cloudinary folder holding one venue's photos. */
export const venuePhotoFolder = (venueId: string) => `shuttio/venues/${venueId}`

/**
 * Cloudinary's upload signature: the params sorted by key, joined as
 * `k=v&k2=v2`, with the API secret appended, SHA-1 hex.
 */
export function signCloudinaryParams(
  params: Record<string, string | number>,
  apiSecret: string
): string {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&")
  return createHash("sha1")
    .update(payload + apiSecret)
    .digest("hex")
}

/**
 * Whether `url` is an image this app uploaded for `venueId` — an HTTPS
 * delivery URL on our Cloudinary cloud, inside that venue's folder. Stops an
 * operator from pinning arbitrary third-party URLs (or another venue's
 * photos) onto their venue.
 */
export function isVenuePhotoUrl(
  url: string,
  cloudName: string,
  venueId: string
): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname === "res.cloudinary.com" &&
    !parsed.search &&
    !parsed.hash &&
    parsed.pathname.startsWith(`/${cloudName}/image/upload/`) &&
    parsed.pathname.includes(`/${venuePhotoFolder(venueId)}/`)
  )
}

export interface VenuePhotoUploadSignature {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  allowedFormats: string
  signature: string
}

/**
 * Venue photo gallery. The browser uploads straight to Cloudinary with a
 * short-lived signature from {@link signUpload} (the API secret never leaves
 * the server), then saves the returned URLs here. Callers (the controller)
 * authorize the operator against the venue first.
 */
@Injectable()
export class VenuePhotosService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @InjectModel(Venue.name) private readonly venueModel: Model<VenueDocument>
  ) {}

  private cloudinary(): {
    cloudName: string
    apiKey: string
    apiSecret: string
  } {
    const cloudName = this.config.get<string>("CLOUDINARY_CLOUD_NAME")
    const apiKey = this.config.get<string>("CLOUDINARY_API_KEY")
    const apiSecret = this.config.get<string>("CLOUDINARY_API_SECRET")
    if (!cloudName || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException(
        "Chưa cấu hình dịch vụ lưu ảnh (Cloudinary)"
      )
    }
    return { cloudName, apiKey, apiSecret }
  }

  /** Signed params for one direct browser → Cloudinary upload. */
  signUpload(venueId: string): VenuePhotoUploadSignature {
    const { cloudName, apiKey, apiSecret } = this.cloudinary()
    const timestamp = Math.floor(Date.now() / 1000)
    const folder = venuePhotoFolder(venueId)
    const signature = signCloudinaryParams(
      { allowed_formats: VENUE_PHOTO_FORMATS, folder, timestamp },
      apiSecret
    )
    return {
      cloudName,
      apiKey,
      timestamp,
      folder,
      allowedFormats: VENUE_PHOTO_FORMATS,
      signature,
    }
  }

  /**
   * Replace the venue's gallery (order = display order, first = cover).
   * Every URL must be one of this venue's own Cloudinary uploads.
   */
  async setPhotos(venueId: string, photos: string[]): Promise<string[]> {
    const { cloudName } = this.cloudinary()
    const unique = [...new Set(photos)]
    if (unique.length > MAX_VENUE_PHOTOS) {
      throw new BadRequestException(
        `Tối đa ${MAX_VENUE_PHOTOS} ảnh cho mỗi chi nhánh`
      )
    }
    if (!unique.every((url) => isVenuePhotoUrl(url, cloudName, venueId))) {
      throw new BadRequestException("Ảnh không hợp lệ")
    }
    // Load → mutate → versioned save, like every other `info` writer, so a
    // concurrent profile edit can't silently overwrite the new gallery.
    return withVersionRetry(async () => {
      const doc = await this.venueModel.findOne({ venueId })
      if (!doc) throw new NotFoundException("Venue not found")
      doc.info.photos = unique
      doc.markModified("info")
      await doc.save()
      return unique
    })
  }
}
