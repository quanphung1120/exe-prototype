import { IsNotEmpty, IsString, Length } from "class-validator"

export class AssessmentUserIdParamDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 128)
  userId: string
}
