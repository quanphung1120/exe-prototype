import { IsNotEmpty, IsString } from "class-validator"

export class NotificationIdParamDto {
  @IsString()
  @IsNotEmpty()
  id: string
}
