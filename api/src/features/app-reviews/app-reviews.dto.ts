import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator"

/** Longest comment a review may carry (mirrored by the web dialog). */
export const APP_REVIEW_COMMENT_MAX = 500

export class UpsertAppReviewBodyDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number

  @IsOptional()
  @IsString()
  @MaxLength(APP_REVIEW_COMMENT_MAX)
  comment?: string
}

export class AppReviewUserParamDto {
  @IsString()
  @IsNotEmpty()
  userId: string
}
