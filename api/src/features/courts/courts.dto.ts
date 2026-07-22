import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator"

import type { SportKey } from "../../shared/index.js"

const SPORTS = ["badminton"] as const

export class ListCourtsQueryDto {
  @IsOptional()
  @IsIn(SPORTS)
  sport?: SportKey
}

export class CourtParamDto {
  @IsString()
  @IsNotEmpty()
  id: string
}
