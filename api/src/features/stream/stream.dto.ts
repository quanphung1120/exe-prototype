import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  Matches,
} from "class-validator"

// The token body carries the caller's display name/avatar (read from Clerk on
// the web side) so the api can upsert their Stream user on first seed — every
// field is optional because seeding only happens once and the guard already
// asserts the user id, so an empty POST body is tolerated.
export class TokenBodyDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  image?: string
}

export class ChannelBodyDto {
  @Matches(/^[\w-]{1,64}$/, { message: "Invalid channel id" })
  id: string

  @IsString()
  @Length(1, 80)
  name: string

  @IsArray()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  @Length(1, 4, { each: true })
  memberInitials: string[]
}
