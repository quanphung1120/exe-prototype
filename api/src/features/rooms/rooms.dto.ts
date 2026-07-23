import { IsIn, IsNotEmpty, IsString } from "class-validator"

export class RoomIdParamDto {
  @IsString()
  @IsNotEmpty()
  id: string
}

export class RoomRequestParamDto extends RoomIdParamDto {
  @IsString()
  @IsNotEmpty()
  userId: string
}

export const ROOM_REQUEST_DECISIONS = ["approve", "decline"] as const
export type RoomRequestDecision = (typeof ROOM_REQUEST_DECISIONS)[number]

export class RoomRequestDecisionBodyDto {
  @IsIn(ROOM_REQUEST_DECISIONS)
  decision: RoomRequestDecision
}
