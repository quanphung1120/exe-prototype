import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import type { Model } from "mongoose"

import type { VenueDocument } from "../src/features/venues/venue.schema.js"
import {
  MAX_VENUE_PHOTOS,
  VENUE_PHOTO_FORMATS,
  VenuePhotosService,
  isVenuePhotoUrl,
  signCloudinaryParams,
  venuePhotoFolder,
} from "../src/features/venues/venue-photos.service.js"

/**
 * Venue photos: uploads go browser → Cloudinary with a server-made signature,
 * and the gallery only ever stores URLs from this venue's own folder on our
 * own cloud.
 */

const CLOUD = "shuttio-test"
const SECRET = "test-secret"
const photo = (venueId: string, name: string) =>
  `https://res.cloudinary.com/${CLOUD}/image/upload/v1700000000/${venuePhotoFolder(venueId)}/${name}.jpg`

function makeService(
  opts: {
    configured?: boolean
    venue?: { info: Record<string, unknown> } | null
  } = {}
) {
  const env: Record<string, string> =
    opts.configured === false
      ? {}
      : {
          CLOUDINARY_CLOUD_NAME: CLOUD,
          CLOUDINARY_API_KEY: "key-1",
          CLOUDINARY_API_SECRET: SECRET,
        }
  const config = { get: (key: string) => env[key] }
  const saved: unknown[] = []
  const doc =
    opts.venue === null
      ? null
      : {
          info: { name: "Sân A", ...(opts.venue?.info ?? {}) },
          markModified: () => undefined,
          save() {
            saved.push(structuredClone(this.info))
            return Promise.resolve(this)
          },
        }
  const model = { findOne: () => Promise.resolve(doc) }
  const service = new VenuePhotosService(
    config as unknown as ConfigService,
    model as unknown as Model<VenueDocument>
  )
  return { service, saved }
}

void test("signCloudinaryParams matches Cloudinary's documented example", () => {
  // From Cloudinary's "Generating authentication signatures" docs.
  assert.equal(
    signCloudinaryParams(
      {
        timestamp: 1315060510,
        public_id: "sample_image",
        eager: "w_400,h_300,c_pad|w_260,h_200,c_crop",
      },
      "abcd"
    ),
    "bfd09f95f331f558cbd1320e67aa8d488770583e"
  )
})

void test("signUpload signs the folder, formats and timestamp for that venue", () => {
  const { service } = makeService()
  const sig = service.signUpload("v4")

  assert.equal(sig.cloudName, CLOUD)
  assert.equal(sig.apiKey, "key-1")
  assert.equal(sig.folder, "shuttio/venues/v4")
  assert.equal(sig.allowedFormats, VENUE_PHOTO_FORMATS)
  assert.equal(
    sig.signature,
    signCloudinaryParams(
      {
        allowed_formats: VENUE_PHOTO_FORMATS,
        folder: "shuttio/venues/v4",
        timestamp: sig.timestamp,
      },
      SECRET
    )
  )
  // The secret itself is never handed out.
  assert.equal(JSON.stringify(sig).includes(SECRET), false)
})

void test("photo routes answer 503 when Cloudinary isn't configured", async () => {
  const { service } = makeService({ configured: false })
  assert.throws(() => service.signUpload("v4"), ServiceUnavailableException)
  await assert.rejects(service.setPhotos("v4", []), ServiceUnavailableException)
})

void test("isVenuePhotoUrl only accepts this venue's uploads on our cloud", () => {
  assert.equal(isVenuePhotoUrl(photo("v4", "a"), CLOUD, "v4"), true)
  // Another venue's folder, another cloud, another host, plain http, a query.
  assert.equal(isVenuePhotoUrl(photo("v5", "a"), CLOUD, "v4"), false)
  assert.equal(
    isVenuePhotoUrl(photo("v4", "a").replace(CLOUD, "other"), CLOUD, "v4"),
    false
  )
  assert.equal(
    isVenuePhotoUrl(
      "https://evil.example/shuttio/venues/v4/a.jpg",
      CLOUD,
      "v4"
    ),
    false
  )
  assert.equal(
    isVenuePhotoUrl(photo("v4", "a").replace("https:", "http:"), CLOUD, "v4"),
    false
  )
  assert.equal(isVenuePhotoUrl(`${photo("v4", "a")}?x=1`, CLOUD, "v4"), false)
  assert.equal(isVenuePhotoUrl("not a url", CLOUD, "v4"), false)
  // A venue id that merely prefixes another (v4 vs v40) must not match.
  assert.equal(isVenuePhotoUrl(photo("v40", "a"), CLOUD, "v4"), false)
})

void test("setPhotos stores the de-duplicated gallery in order", async () => {
  const { service, saved } = makeService()
  const a = photo("v4", "a")
  const b = photo("v4", "b")

  assert.deepEqual(await service.setPhotos("v4", [b, a, b]), [b, a])
  assert.deepEqual(saved, [{ name: "Sân A", photos: [b, a] }])
})

void test("setPhotos rejects foreign URLs, too many photos and unknown venues", async () => {
  await assert.rejects(
    makeService().service.setPhotos("v4", [photo("v5", "a")]),
    BadRequestException
  )
  const tooMany = Array.from({ length: MAX_VENUE_PHOTOS + 1 }, (_, i) =>
    photo("v4", `p${i}`)
  )
  await assert.rejects(
    makeService().service.setPhotos("v4", tooMany),
    BadRequestException
  )
  await assert.rejects(
    makeService({ venue: null }).service.setPhotos("v4", [photo("v4", "a")]),
    NotFoundException
  )
})
