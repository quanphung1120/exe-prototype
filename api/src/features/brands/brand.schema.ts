import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { Schema as MongooseSchema, type HydratedDocument } from "mongoose"

import type {
  Brand as BrandInfo,
  VenueApprovalStatus,
} from "../../shared/index.js"

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
  // Manual admin approval gate — lives on the BRAND, not the venue: a fresh
  // brand starts "pending" and none of its branches can take bookings until an
  // admin approves it; branches added later inherit the brand's status with no
  // further review. Venue docs carry a denormalized copy (`Venue.approval`),
  // stamped at branch creation and rewritten by the admin approve/reject
  // propagation (`VenuesService#setApprovalForBrand`). Missing on brands
  // created before this field existed — treated as "approved" (see
  // `effectiveBrandApproval`) rather than backfilled.
  @Prop({ type: String, index: true }) approval?: VenueApprovalStatus
  @Prop({ type: String }) approvalReason?: string
  @Prop({ type: String }) approvedAt?: string
}

/**
 * A brand doc's resolved approval status, treating an absent value (brands
 * created before the approval gate moved here) as `"approved"`.
 */
export function effectiveBrandApproval(doc: {
  approval?: VenueApprovalStatus
}): VenueApprovalStatus {
  return doc.approval ?? "approved"
}

export type BrandDocument = HydratedDocument<Brand>
export const BrandSchema = SchemaFactory.createForClass(Brand)
// One brand per account: unique on ownerId. Not sparse — a brand always has a
// real owner (ownerless demo venues simply carry no brandId).
BrandSchema.index({ ownerId: 1 }, { unique: true })
