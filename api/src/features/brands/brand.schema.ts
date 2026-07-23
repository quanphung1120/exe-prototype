import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { Schema as MongooseSchema, type HydratedDocument } from "mongoose"

import type { Brand as BrandInfo } from "../../shared/index.js"

// A brand document is the account-owned parent of one or more venue branches
// (chi nhánh). Its `info` (name/logo/description) is a flexible Mixed sub-
// document, mirroring the venue schema. `ownerId` is unique so each Clerk
// account owns at most one brand; venues denormalize it onto `Venue.ownerId`
// so booking/notification auth needs no brand join.
@Schema({ timestamps: true, minimize: false, optimisticConcurrency: true })
export class Brand {
  @Prop({ type: String, required: true, unique: true, index: true })
  brandId: string
  @Prop({ type: String, required: true }) ownerId: string
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) info: BrandInfo
}

export type BrandDocument = HydratedDocument<Brand>
export const BrandSchema = SchemaFactory.createForClass(Brand)
// One brand per account: unique on ownerId. Not sparse — a brand always has a
// real owner (ownerless demo venues simply carry no brandId).
BrandSchema.index({ ownerId: 1 }, { unique: true })
