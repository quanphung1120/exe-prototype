import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

import {
  VENUE_PHOTO_FORMATS,
  signCloudinaryParams,
  type VenuePhotoUploadSignature,
} from "../venues/venue-photos.service.js"

/** Cloudinary folder for one venue's payment screenshots (transfers and refunds). */
export const proofFolder = (venueId: string) =>
  `shuttio/payment-proofs/${venueId}`

/**
 * Whether `url` is an image this app uploaded as a payment screenshot for
 * `venueId` — an HTTPS delivery URL on our Cloudinary cloud inside that venue's
 * proof folder. Stops a caller from attaching arbitrary third-party URLs or
 * another venue's uploads.
 */
export function isProofUrl(
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
    parsed.pathname.includes(`/${proofFolder(venueId)}/`)
  )
}

/**
 * Signs direct browser → Cloudinary uploads of payment screenshots and checks
 * the URLs that come back. Callers authorize who may upload for which booking.
 */
@Injectable()
export class ProofUploadService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  private cloudinary() {
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

  /** A signature for one upload into the venue's proof folder. */
  sign(venueId: string): VenuePhotoUploadSignature {
    const { cloudName, apiKey, apiSecret } = this.cloudinary()
    const timestamp = Math.floor(Date.now() / 1000)
    const folder = proofFolder(venueId)
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

  /** Throws unless `url` is one of this venue's own proof uploads. */
  assertProofUrl(url: string, venueId: string): void {
    const { cloudName } = this.cloudinary()
    if (!isProofUrl(url, cloudName, venueId)) {
      throw new BadRequestException("Ảnh không hợp lệ")
    }
  }
}
