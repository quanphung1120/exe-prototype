import { IsNotEmpty, IsOptional, IsString } from "class-validator"

/** `?venue=` selects which venue's bundle to read; optional → defaults to first. */
export class VenueQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  venue?: string
}

/** `?venue=` is required for the raw bundle (unknown id → 404, no fallback). */
export class BundleQueryDto {
  @IsString()
  @IsNotEmpty()
  venue: string
}
