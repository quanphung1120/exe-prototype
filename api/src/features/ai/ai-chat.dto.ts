import { Type } from "class-transformer"
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from "class-validator"

// Skill level per sport. Closed enum — a crafted value can't smuggle text into
// the system prompt (defence layer 1; the prompt also fences it as untrusted).
export class UserLevelsDto {
  @IsOptional()
  @IsIn(["beginner", "intermediate", "advanced"])
  badminton?: "beginner" | "intermediate" | "advanced"
}

export class UserLocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number
}

export class AiChatDto {
  // Handed to convertToModelMessages, which validates structure. We only assert
  // it's an array and cap its length; the controller adds a serialized-size cap.
  @IsArray()
  @ArrayMaxSize(50)
  messages!: unknown[]

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UserLevelsDto)
  userLevels?: UserLevelsDto

  @IsOptional()
  @ValidateNested()
  @Type(() => UserLocationDto)
  userLocation?: UserLocationDto | null

  @IsOptional()
  @IsIn(["en", "vi"])
  locale?: "en" | "vi"
}
