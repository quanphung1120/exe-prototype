import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator"

export class CreateRatingBodyDto {
  @IsString()
  @Length(1, 128)
  sessionId: string

  @IsString()
  @Length(1, 128)
  rateeId: string

  @IsInt()
  @Min(1)
  @Max(5)
  stars: number

  @IsOptional()
  @IsString()
  @Length(0, 300)
  comment?: string
}

export class SessionIdParamDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string
}

export class UserIdParamDto {
  @IsString()
  @IsNotEmpty()
  userId: string
}
