import { IsNotEmpty, IsOptional, IsString } from "class-validator"

export class SeedQueryDto {
  // Which venue's operator bundle to hydrate (defaults to the first venue).
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  venue?: string
}
